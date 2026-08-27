import asyncio
import random
import time
import json
import csv
import os
import paho.mqtt.client as mqtt
from typing import List, Dict, Any
from fastapi import FastAPI, UploadFile, File, WebSocket, WebSocketDisconnect, Depends, HTTPException, status, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(
    title="Industrial Digital Twin Backend",
    description="Secure gateway managing Keycloak SSO, OPA rules, InfluxDB telemetry streams, and AI P&ID extractions."
)

# Enable CORS for Next.js app
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, restrict to frontend domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global placeholder for extracted topology graph
last_extracted_topology = None

# Mock Security schemas
class UserSession(BaseModel):
    username: str
    role: str
    authenticated: bool

def verify_keycloak_token(token: str = "mock-bearer-token") -> UserSession:
    """Simulates validating the JWT token against Keycloak SSO."""
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Keycloak JWT validation token"
        )
    return UserSession(username="admin_eng", role="Admin", authenticated=True)

def check_opa_policy(user: UserSession = Depends(verify_keycloak_token)) -> bool:
    """Simulates checking policy query against Open Policy Agent (OPA) engine."""
    if user.role != "Admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="OPA Policy rejection: Write access denied for non-admin role."
        )
    return True

# Bounding box schemas
class BBoxResponse(BaseModel):
    id: str
    label: str
    x: float
    y: float
    w: float
    h: float
    confidence: float
    tag: str = ""

class LineResponse(BaseModel):
    id: str
    startX: float
    startY: float
    endX: float
    endY: float

class ExtractionResponse(BaseModel):
    bboxes: List[BBoxResponse]
    lines: List[LineResponse]

import sys
import subprocess
import shutil
import tempfile
import os
import json

@app.post("/api/extract", response_model=ExtractionResponse)
async def extract_pid_data(
    file: UploadFile = File(...),
    authorized: bool = Depends(check_opa_policy)
):
    """
    Receives a P&ID drawing and triggers the Python AI Agent extraction pipeline.
    Runs the locally trained YOLO model and OpenCV line detection, returning bounding boxes and lines.
    """
    temp_dir = tempfile.mkdtemp()
    temp_file_path = os.path.join(temp_dir, file.filename)
    
    # Signal that extraction has started — write 1% so frontend polling sees it begin.
    # yolo_inference.py will then write 5%, 15%, 25%... up to 100%.
    # Never reset to 0% here — that causes the "progress goes backwards" bug.
    try:
        progress_path = os.path.join(tempfile.gettempdir(), "pid_extraction_progress.json")
        with open(progress_path, "w") as f:
            json.dump({"percent": 1, "status": "Receiving P&ID drawing..."}, f)
    except Exception:
        pass

    try:
        with open(temp_file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # Signal file received, subprocess about to launch
        try:
            with open(progress_path, "w") as f:
                json.dump({"percent": 3, "status": "Launching AI extraction pipeline..."}, f)
        except Exception:
            pass
            
        python_exe = sys.executable
        default_model_path = os.path.abspath(os.path.join(
            os.path.dirname(__file__),
            "..", "..", "..", "MLOpsManufacturing-main", "samples", "amlv2_pid_symbol_detection_train", "src", "app", "runs", "detect", "train-7", "weights", "best_backup_32class.pt"
        ))
        model_path = os.getenv("YOLO_MODEL_PATH", default_model_path)
        script_path = os.path.join(os.path.dirname(__file__), "yolo_inference.py")
        
        # Execute subprocess in a thread pool to keep event loop unblocked
        # (asyncio.create_subprocess_exec is not supported on Windows SelectorEventLoop)
        def _run_yolo():
            return subprocess.run(
                [python_exe, script_path, temp_file_path, model_path],
                capture_output=True,
                text=True
            )
        
        proc = await asyncio.to_thread(_run_yolo)
        
        if proc.returncode != 0:
            raise HTTPException(
                status_code=500,
                detail=f"Subprocess failed with code {proc.returncode}. Stderr: {proc.stderr}"
            )
            
        output_lines = proc.stdout.strip().split("\n")
        result = None
        for line in reversed(output_lines):
            try:
                result = json.loads(line.strip())
                break
            except json.JSONDecodeError:
                continue
                
        if result is None:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to parse subprocess output. Output: {proc.stdout}\nStderr: {proc.stderr}"
            )
            
        if "error" in result:
            raise HTTPException(status_code=500, detail=result["error"])
            
        # Store extracted topology graph globally and locally to persist across reloads
        global last_extracted_topology
        last_extracted_topology = result.get("topology")
        try:
            topology_path = os.path.join(tempfile.gettempdir(), "last_topology.json")
            with open(topology_path, "w") as f:
                json.dump(last_extracted_topology, f)
        except Exception as e:
            print(f"Error writing last_topology.json: {e}")
            
        # Map the normalized boxes to BBoxResponse list
        response_boxes = []
        for box in result.get("bboxes", []):
            response_boxes.append(
                BBoxResponse(
                    id=box["id"],
                    label=box["label"],
                    x=box["x"],
                    y=box["y"],
                    w=box["w"],
                    h=box["h"],
                    confidence=box["confidence"],
                    tag=box.get("tag", "")
                )
            )
            
        # Map the detected line segments
        response_lines = []
        for line in result.get("lines", []):
            response_lines.append(
                LineResponse(
                    id=line["id"],
                    startX=line["startX"],
                    startY=line["startY"],
                    endX=line["endX"],
                    endY=line["endY"]
                )
            )
            
        return ExtractionResponse(bboxes=response_boxes, lines=response_lines)
        
    except subprocess.CalledProcessError as e:
        print(f"Subprocess error: {e.stderr}")
        raise HTTPException(status_code=500, detail=f"YOLO subprocess error: {e.stderr}")
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        print(f"Extraction error: {type(e).__name__}: {str(e)}\n{tb}")
        raise HTTPException(status_code=500, detail=f"{type(e).__name__}: {str(e)}\n{tb}")
    finally:
        # Clean up temp file
        if os.path.exists(temp_file_path):
            os.remove(temp_file_path)
        if os.path.exists(temp_dir):
            os.rmdir(temp_dir)

@app.get("/api/extract/progress")
async def get_extraction_progress():
    """Serves the current extraction progress percentage and description."""
    progress_path = os.path.join(tempfile.gettempdir(), "pid_extraction_progress.json")
    if os.path.exists(progress_path):
        try:
            with open(progress_path, "r") as f:
                return json.load(f)
        except Exception:
            pass
    return {"percent": 0, "status": "Initializing extraction..."}

import requests
from neo4j import GraphDatabase

# AAS Middleware & Neo4j DB Settings
BASYX_URL = "http://localhost:9081"
NEO4J_URI = "bolt://localhost:7687"
NEO4J_USER = "neo4j"
NEO4J_PASSWORD = "testpassword"

# AAS Hierarchy route (Eclipse BaSyx Model)
@app.get("/api/aas/hierarchy")
async def get_aas_hierarchy():
    """Serves the asset tree structure fetched from Eclipse BaSyx middleware, falling back to local simulation if unreachable."""
    fallback_data = {
        "id": "root",
        "name": "Plant Root",
        "children": [
            {
                "id": "main-station",
                "name": "Main Station",
                "status": "green",
                "children": [
                    {
                        "id": "intake-section",
                        "name": "Intake Section",
                        "status": "green",
                        "children": [
                            {"id": "urn:jesa:P01:Intake:Pump:P101", "name": "Intake Pump P101", "status": "green", "tag": "P-101"},
                            {"id": "urn:jesa:P01:Filtration:Filter:F102", "name": "Filter Unit 1", "status": "green", "tag": "F-102"}
                        ]
                    },
                    {
                        "id": "pump-station",
                        "name": "Pump Station",
                        "status": "green"
                    }
                ]
            },
            {"id": "storage", "name": "Storage", "status": "green"},
            {"id": "ro-system", "name": "RO System", "status": "green"},
            {"id": "bottling-line", "name": "Bottling Line", "status": "green"}
        ]
    }

    try:
        resp = requests.get(f"{BASYX_URL}/shells", timeout=1.5)
        resp.raise_for_status()
        shells = resp.json()

        # Handle paginated wrapper result or direct array
        shells_list = []
        if isinstance(shells, dict) and "result" in shells:
            shells_list = shells["result"]
        elif isinstance(shells, list):
            shells_list = shells

        if not shells_list:
            return fallback_data

        dynamic_children = []
        for shell in shells_list:
            shell_id = shell.get("id")
            id_short = shell.get("idShort", shell_id)
            
            # Map shell identifiers to asset tag codes
            tag = id_short
            if "PMP" in id_short or "P101" in id_short:
                tag = "P-101"
            elif "TNK" in id_short or "T202" in id_short:
                tag = "T-300"
            elif "FLT" in id_short or "F102" in id_short:
                tag = "F-102"

            dynamic_children.append({
                "id": shell_id,
                "name": id_short,
                "status": "green",
                "tag": tag
            })

        return {
            "id": "root",
            "name": "Plant Root (BaSyx Server)",
            "status": "green",
            "children": [
                {
                    "id": "main-station",
                    "name": "Main Station",
                    "status": "green",
                    "children": dynamic_children
                }
            ]
        }
    except Exception as e:
        print(f"BaSyx connection error (using mock fallback): {e}")
        return fallback_data


MOCK_PUBLISHED_SHELLS = []
MOCK_PUBLISHED_SUBMODELS = {}

@app.post("/api/aas/publish")
async def publish_shells(req: Request):
    global MOCK_PUBLISHED_SHELLS, MOCK_PUBLISHED_SUBMODELS
    data = await req.json()
    items = data.get("items", [])
    
    shells = []
    seen = {}
    MOCK_PUBLISHED_SUBMODELS.clear()
    
    for item in items:
        if isinstance(item, dict):
            base_sid = item.get("sid", "Unknown")
            props = item.get("props", {})
        else:
            base_sid = item
            props = {}
            
        sid = base_sid
        if base_sid in seen:
            seen[base_sid] += 1
            sid = f"{base_sid}_{seen[base_sid]}"
        else:
            seen[base_sid] = 1
            
        shells.append({
            "id": f"https://jesa.ma/aas/{sid}",
            "idShort": sid,
            "assetInformation": {
                "assetKind": "Instance",
                "globalAssetId": f"https://jesa.ma/assets/{sid}"
            }
        })
        
        # Build custom TechnicalData Submodel
        submodelElements = []
        for k, v in props.items():
            if k == "_datasheetFileName":
                submodelElements.append({
                    "idShort": "Datasheet",
                    "modelType": "File",
                    "mimeType": props.get("_datasheetMimeType", "application/pdf"),
                    "value": f"/files/datasheets/{v}"
                })
            elif k == "_datasheetMimeType":
                continue
            else:
                submodelElements.append({
                    "idShort": k.replace(" ", "").replace("(", "").replace(")", "").replace("/", "").replace("-", ""),
                    "modelType": "Property",
                    "valueType": "xs:string",
                    "value": str(v)
                })
            
        MOCK_PUBLISHED_SUBMODELS[sid] = [
            {
                "idShort": "TechnicalData",
                "id": f"https://jesa.ma/aas/{sid}/submodels/TechnicalData",
                "modelType": "Submodel",
                "submodelElements": submodelElements
            },
            {
                "idShort": "OperationalData",
                "id": f"https://jesa.ma/aas/{sid}/submodels/OperationalData",
                "modelType": "Submodel",
                "submodelElements": [
                    {"idShort": "CurrentTemperature", "modelType": "Property", "valueType": "xs:double", "value": "42.5"},
                    {"idShort": "CurrentPressure", "modelType": "Property", "valueType": "xs:double", "value": "4.2"}
                ]
            },
            {
                "idShort": "TimeSeries",
                "id": f"https://jesa.ma/aas/{sid}/submodels/TimeSeries",
                "modelType": "Submodel",
                "submodelElements": [
                    {
                        "idShort": "Segments",
                        "modelType": "SubmodelElementCollection",
                        "value": [
                            {
                                "idShort": "CurrentTemperatureSegment",
                                "modelType": "SubmodelElementCollection",
                                "value": [
                                    {"idShort": "Min", "modelType": "Property", "valueType": "xs:double", "value": "20.0"},
                                    {"idShort": "Max", "modelType": "Property", "valueType": "xs:double", "value": "95.0"}
                                ]
                            },
                            {
                                "idShort": "CurrentPressureSegment",
                                "modelType": "SubmodelElementCollection",
                                "value": [
                                    {"idShort": "Min", "modelType": "Property", "valueType": "xs:double", "value": "1.0"},
                                    {"idShort": "Max", "modelType": "Property", "valueType": "xs:double", "value": "16.0"}
                                ]
                            }
                        ]
                    }
                ]
            }
        ]
        
    MOCK_PUBLISHED_SHELLS = shells
    return {"status": "ok", "published_count": len(shells)}


@app.get("/api/aas/shells")
async def get_shells():
    """Serves the list of AAS shells from BaSyx server, falling back to static assets if empty or offline."""
    try:
        resp = requests.get(f"{BASYX_URL}/shells", timeout=1.0)
        resp.raise_for_status()
        data = resp.json()
        result = data.get("result", []) if isinstance(data, dict) else data
        if result:
            return result
    except Exception:
        pass
    
    if MOCK_PUBLISHED_SHELLS:
        return MOCK_PUBLISHED_SHELLS
        
    return [
        {
            "id": f"https://jesa.ma/aas/{sid}",
            "idShort": sid,
            "assetInformation": {
                "assetKind": "Instance",
                "globalAssetId": f"https://jesa.ma/assets/{sid}"
            }
        }
        for sid in [
            "FLT-601", "HEX-501", "MXR-701", "PMP-101", "PMP-102", 
            "TNK-202", "TNK-203", "VLV-301", "VLV-302", "SNS-401", "SNS-402", "SNS-403"
        ]
    ]


@app.get("/api/aas/shells/{shell_id_short}/submodels")
async def get_shell_submodels(shell_id_short: str):
    if shell_id_short in MOCK_PUBLISHED_SUBMODELS:
        return MOCK_PUBLISHED_SUBMODELS[shell_id_short]
        
    """Serves the detailed submodels (TechnicalData, OperationalData, TimeSeries) for a given shell."""
    manufacturer = "Siemens"
    if "TNK" in shell_id_short:
        manufacturer = "Endress+Hauser"
    elif "FLT" in shell_id_short:
        manufacturer = "Pall Corp"
    elif "HEX" in shell_id_short:
        manufacturer = "Alfa Laval"
    
    max_press = 15.0 if "PMP" in shell_id_short else 8.0
    max_temp = 85.0 if "PMP" in shell_id_short else 90.0

    return [
        {
            "idShort": "TechnicalData",
            "id": f"https://jesa.ma/aas/{shell_id_short}/submodels/TechnicalData",
            "modelType": "Submodel",
            "submodelElements": [
                {"idShort": "ManufacturerName", "modelType": "Property", "valueType": "xs:string", "value": manufacturer},
                {"idShort": "MaxPressure", "modelType": "Property", "valueType": "xs:double", "value": str(max_press)},
                {"idShort": "MaxTemperature", "modelType": "Property", "valueType": "xs:double", "value": str(max_temp)},
                {"idShort": "InstallationDate", "modelType": "Property", "valueType": "xs:string", "value": "2024-03-01"}
            ]
        },
        {
            "idShort": "OperationalData",
            "id": f"https://jesa.ma/aas/{shell_id_short}/submodels/OperationalData",
            "modelType": "Submodel",
            "submodelElements": [
                {"idShort": "CurrentTemperature", "modelType": "Property", "valueType": "xs:double", "value": "42.5"},
                {"idShort": "CurrentPressure", "modelType": "Property", "valueType": "xs:double", "value": "4.2"}
            ]
        },
        {
            "idShort": "TimeSeries",
            "id": f"https://jesa.ma/aas/{shell_id_short}/submodels/TimeSeries",
            "modelType": "Submodel",
            "submodelElements": [
                {
                    "idShort": "Segments",
                    "modelType": "SubmodelElementCollection",
                    "value": [
                        {
                            "idShort": "CurrentTemperatureSegment",
                            "modelType": "SubmodelElementCollection",
                            "value": [
                                {"idShort": "Min", "modelType": "Property", "valueType": "xs:double", "value": "20.0"},
                                {"idShort": "Max", "modelType": "Property", "valueType": "xs:double", "value": "95.0"}
                            ]
                        },
                        {
                            "idShort": "CurrentPressureSegment",
                            "modelType": "SubmodelElementCollection",
                            "value": [
                                {"idShort": "Min", "modelType": "Property", "valueType": "xs:double", "value": "1.0"},
                                {"idShort": "Max", "modelType": "Property", "valueType": "xs:double", "value": "16.0"}
                            ]
                        }
                    ]
                }
            ]
        }
    ]


# Neo4j Knowledge Graph Topology route
@app.get("/api/graph/topology")
async def get_graph_topology():
    """Fetches nodes and relationship edges dynamically from Neo4j graph database, falling back if offline."""
    global last_extracted_topology
    if last_extracted_topology is not None:
        return last_extracted_topology

    try:
        import tempfile
        json_path = os.path.join(tempfile.gettempdir(), "last_topology.json")
        if os.path.exists(json_path):
            with open(json_path, "r") as f:
                last_extracted_topology = json.load(f)
                return last_extracted_topology
    except Exception as e:
        print(f"Error reading last_topology.json: {e}")

    fallback_data = {
        "nodes": [
            {
                "id": "Sensor_C_Alert", 
                "label": "[Sensor_C_Alert]", 
                "type": "sensor", 
                "status": "red",
                "properties": {
                    "id": "Sensor_C_Alert",
                    "type": "Sensor",
                    "manufacturer": "Endress+Hauser",
                    "installation_date": "2024-03-01",
                    "max_pressure": 10.0,
                    "max_temp": 85.0,
                    "aas_endpoint": "http://localhost:9081/shells/Sensor_C_Alert"
                }
            },
            {
                "id": "Pump_2_Temp_High", 
                "label": "[Pump_2_Temp_High]", 
                "type": "pump", 
                "status": "red",
                "properties": {
                    "id": "Pump_2_Temp_High",
                    "type": "Pump",
                    "manufacturer": "KSB",
                    "installation_date": "2024-01-15",
                    "max_pressure": 16.0,
                    "max_temp": 80.0,
                    "aas_endpoint": "http://localhost:9081/shells/Pump_2_Temp_High"
                }
            },
            {
                "id": "Operator_Note_Jan10", 
                "label": "[Operator_Note_Jan10]", 
                "type": "note", 
                "status": "green",
                "properties": {
                    "id": "Operator_Note_Jan10",
                    "type": "Note",
                    "manufacturer": "System",
                    "installation_date": "2024-01-10",
                    "max_pressure": 0.0,
                    "max_temp": 0.0,
                    "aas_endpoint": ""
                }
            },
            {
                "id": "Valve_Failure_Pred", 
                "label": "[Valve_Failure_Pred]", 
                "type": "valve", 
                "status": "orange",
                "properties": {
                    "id": "Valve_Failure_Pred",
                    "type": "Valve",
                    "manufacturer": "Flowserve",
                    "installation_date": "2024-02-10",
                    "max_pressure": 8.0,
                    "max_temp": 95.0,
                    "aas_endpoint": "http://localhost:9081/shells/Valve_Failure_Pred"
                }
            },
            {
                "id": "Maintenance_Log_3", 
                "label": "[Maintenance_Log_3]", 
                "type": "log", 
                "status": "green",
                "properties": {
                    "id": "Maintenance_Log_3",
                    "type": "Log",
                    "manufacturer": "System",
                    "installation_date": "2024-01-05",
                    "max_pressure": 0.0,
                    "max_temp": 0.0,
                    "aas_endpoint": ""
                }
            }
        ],
        "edges": [
            {"source": "Sensor_C_Alert", "target": "Pump_2_Temp_High", "label": "effects"},
            {"source": "Pump_2_Temp_High", "target": "Operator_Note_Jan10", "label": "predicted_by"},
            {"source": "Operator_Note_Jan10", "target": "Valve_Failure_Pred", "label": "links_to"},
            {"source": "Valve_Failure_Pred", "target": "Maintenance_Log_3", "label": "resolves"}
        ]
    }

    try:
        with GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD)) as driver:
            driver.verify_connectivity()
            with driver.session() as session:
                result = session.run("MATCH (n) OPTIONAL MATCH (n)-[r]->(m) RETURN n, r, m")
                
                nodes_map = {}
                edges = []
                for record in result:
                    n = record["n"]
                    if n:
                        # Extract id properties from the node properties, falling back to element ID
                        node_id = n.get("id") or n.element_id
                        labels = list(n.labels)
                        node_type = labels[0].lower() if labels else "unknown"
                        
                        # Map type to status alert states
                        status = "green"
                        if node_type == "alert":
                            status = "red"
                        elif node_type == "cause":
                            status = "orange"

                        # Retrieve all properties as a dictionary
                        properties = dict(n)
                        # Add dynamic extra fields for display alignment
                        properties["type"] = labels[0] if labels else "Node"
                        properties["id"] = node_id
                        properties["aas_id"] = f"https://jesa.ma/aas/{node_id}"

                        nodes_map[node_id] = {
                            "id": node_id,
                            "label": f"[{node_id}]",
                            "type": node_type,
                            "status": status,
                            "properties": properties
                        }
                    
                    r = record["r"]
                    m = record["m"]
                    if r is not None and m is not None:
                        src_id = n.get("id") or n.element_id
                        tgt_id = m.get("id") or m.element_id
                        edges.append({
                            "source": src_id,
                            "target": tgt_id,
                            "label": r.type
                        })

                if not nodes_map:
                    return fallback_data

                return {
                    "nodes": list(nodes_map.values()),
                    "edges": edges
                }
    except Exception as e:
        print(f"Neo4j connection error (using mock fallback): {e}")
        return fallback_data

@app.websocket("/ws/telemetry")
async def telemetry_stream(websocket: WebSocket):
    """WebSocket endpoint streaming live telemetry (InfluxDB simulated stream)."""
    await websocket.accept()
    try:
      while True:
          temp = round(random.uniform(40.0, 52.0), 1)
          press = round(random.uniform(3.8, 5.2), 2)
          flow = round(random.uniform(115.0, 128.0), 1)
          
          await websocket.send_json({
              "temp": temp,
              "press": press,
              "flow": flow,
              "timestamp": time.time()
          })
          await asyncio.sleep(1.2)
    except WebSocketDisconnect:
        pass

# --- MQTT and CSV Player Setup ---
MQTT_BROKER = "127.0.0.1"
MQTT_PORT = 1883
RAW_TOPIC = "industrial/sensors/raw"
CONTEXT_TOPIC = "industrial/sensors/contextualized"

# InfluxDB Configuration
import urllib.request
import urllib.error

INFLUX_URL = "http://localhost:8086/api/v2/write?org=jesa&bucket=dts_bucket&precision=s"
INFLUX_TOKEN = "ccyUPLdoBsKF8tPaDfqf3UR48v00CpVTaQfC7RObSBAx9dR7Kd-dw265Hr9yJiiPW5LS0TMX7VDEyRpjDuClhA=="

def write_influx_sync(payload):
    lines = []
    now_s = int(time.time())
    
    # 1. Pump 1
    p1 = payload.get("pmp001")
    if p1:
        speed = p1.get("speed_rpm", 0.0)
        temp = p1.get("temperature_c", 0.0)
        power = p1.get("power_kw", 0.0)
        current = p1.get("current_a", 0.0)
        anomaly = 1 if p1.get("anomaly_detected") else 0
        lines.append(f"pumps,pump_id=PMP-001 speed={speed},temperature={temp},power={power},current={current},anomaly={anomaly} {now_s}")
        
    # 2. Pump 2
    p2 = payload.get("pmp002")
    if p2:
        speed = p2.get("speed_rpm", 0.0)
        temp = p2.get("temperature_c", 0.0)
        power = p2.get("power_kw", 0.0)
        current = p2.get("current_a", 0.0)
        press = p2.get("pressure_bar", 0.0)
        lines.append(f"pumps,pump_id=PMP-002 speed={speed},temperature={temp},power={power},current={current},pressure={press} {now_s}")
        
    # 3. Tank
    tank = payload.get("tank")
    if tank:
        level_liters = tank.get("level_liters", 0.0)
        level_pct = tank.get("level_pct", 0.0)
        press = tank.get("pressure_bar", 0.0)
        flow = tank.get("flow_l_s", 0.0)
        lines.append(f"tanks,tank_id=TK-001 level_l={level_liters},level_pct={level_pct},pressure={press},flow_out={flow} {now_s}")
        
    if not lines:
        return
        
    body = "\n".join(lines).encode("utf-8")
    
    try:
        req = urllib.request.Request(
            INFLUX_URL,
            data=body,
            headers={
                "Authorization": f"Token {INFLUX_TOKEN}",
                "Content-Type": "text/plain; charset=utf-8"
            },
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=2.0) as response:
            response.read()
        print("InfluxDB: Successfully wrote 1 metric batch.")
    except Exception as e:
        print(f"InfluxDB Write Error: {e}")

mqtt_client = mqtt.Client()
sensor_file_path = r"c:\Users\Asus\Desktop\pid extraction\sensor.csv\sensor.csv"
sensor_file_handle = None
sensor_csv_reader = None

def get_next_sensor_row():
    global sensor_file_handle, sensor_csv_reader
    if not os.path.exists(sensor_file_path):
        print(f"MQTT Simulator: Kaggle sensor.csv not found at {sensor_file_path}")
        return None
    try:
        if sensor_file_handle is None:
            print(f"MQTT Simulator: Opening {sensor_file_path} for streaming...")
            sensor_file_handle = open(sensor_file_path, mode="r", encoding="utf-8")
            sensor_csv_reader = csv.DictReader(sensor_file_handle)
        
        row = next(sensor_csv_reader, None)
        if row is None:
            print("MQTT Simulator: Reached EOF of sensor.csv. Rewinding to start.")
            sensor_file_handle.seek(0)
            sensor_file_handle.readline() # Skip header line
            sensor_csv_reader = csv.DictReader(sensor_file_handle)
            row = next(sensor_csv_reader, None)
        return row
    except Exception as e:
        print(f"MQTT Simulator: Error reading sensor.csv: {e}")
        return None

def on_connect(client, userdata, flags, rc):
    print(f"MQTT: Connected to broker on port {MQTT_PORT} with code {rc}")
    client.subscribe(CONTEXT_TOPIC)

def on_message(client, userdata, msg):
    try:
        payload = json.loads(msg.payload.decode())
        # Update sim_state with contextualized data from Node-RED
        if "pmp001" in payload:
            p1 = payload["pmp001"]
            sim_state.pmp001_rpm = float(p1.get("speed_rpm", sim_state.pmp001_rpm))
            sim_state.pmp001_temp = float(p1.get("temperature_c", sim_state.pmp001_temp))
            sim_state.pmp001_power = float(p1.get("power_kw", sim_state.pmp001_power))
            sim_state.pmp001_current = float(p1.get("current_a", getattr(sim_state, "pmp001_current", 0.0)))
            sim_state.pmp001_bearing_wear = bool(p1.get("anomaly_detected", sim_state.pmp001_bearing_wear))
        if "pmp002" in payload:
            p2 = payload["pmp002"]
            sim_state.pmp002_rpm = float(p2.get("speed_rpm", sim_state.pmp002_rpm))
            sim_state.pmp002_temp = float(p2.get("temperature_c", sim_state.pmp002_temp))
            sim_state.pmp002_power = float(p2.get("power_kw", sim_state.pmp002_power))
            sim_state.pmp002_current = float(p2.get("current_a", getattr(sim_state, "pmp002_current", 0.0)))
            sim_state.pmp002_press = float(p2.get("pressure_bar", getattr(sim_state, "pmp002_press", 0.0)))
        if "tank" in payload:
            t = payload["tank"]
            sim_state.tank_level = float(t.get("level_liters", sim_state.tank_level))
            sim_state.lit001_pct = float(t.get("level_pct", sim_state.lit001_pct))
            sim_state.pit001_pressure = float(t.get("pressure_bar", sim_state.pit001_pressure))
            sim_state.fit001_flow = float(t.get("flow_l_s", sim_state.fit001_flow))
            
        # Write to InfluxDB dynamically inside background thread
        write_influx_sync(payload)
    except Exception as e:
        print(f"MQTT: Error parsing message on topic {msg.topic}: {e}")

mqtt_client.on_connect = on_connect
mqtt_client.on_message = on_message

async def publish_telemetry_loop():
    while True:
        try:
            row = get_next_sensor_row()
            if row:
                timestamp = row.get("timestamp")
                machine_status = row.get("machine_status", "NORMAL")
                
                # Dynamic scaling multipliers from user panel
                mult1 = sim_state.pmp001_speed / 100.0
                mult2 = sim_state.pmp002_speed / 100.0 if (sim_state.v001_open and sim_state.tank_level > 0) else 0.0
                
                # Parse numeric values from columns safely
                def safe_float(key, fallback=0.0):
                    val = row.get(key)
                    if val is None or val == "":
                        return fallback
                    try:
                        return float(val)
                    except ValueError:
                        return fallback
                
                # Map sensors:
                p1_data = {
                    "timestamp": timestamp,
                    "power_kw": safe_float("sensor_06") * 0.1 * mult1,
                    "voltage_v": safe_float("sensor_10") * 10.0 if mult1 > 0 else 0.0,
                    "current_a": safe_float("sensor_06") * mult1,
                    "speed_rpm": safe_float("sensor_38") * 35.0 * mult1,
                    "temperature_c": safe_float("sensor_02") if mult1 > 0 else 25.0,
                    "pressure_bar": safe_float("sensor_00") * mult1,
                    "machine_status": machine_status
                }
                
                p2_data = {
                    "timestamp": timestamp,
                    "power_kw": safe_float("sensor_07") * 0.1 * mult2,
                    "voltage_v": safe_float("sensor_11") * 10.0 if mult2 > 0 else 0.0,
                    "current_a": safe_float("sensor_07") * mult2,
                    "speed_rpm": safe_float("sensor_39") * 35.0 * mult2,
                    "temperature_c": safe_float("sensor_03") if mult2 > 0 else 25.0,
                    "pressure_bar": safe_float("sensor_01") * mult2
                }
                
                # Write CSV values straight into sim_state as a fallback.
                # (If Node-RED is running, it will overwrite these values instantly via MQTT).
                sim_state.pmp001_rpm = p1_data["speed_rpm"]
                sim_state.pmp001_temp = p1_data["temperature_c"]
                sim_state.pmp001_power = p1_data["power_kw"]
                sim_state.pmp001_current = p1_data["current_a"]
                
                sim_state.pmp002_rpm = p2_data["speed_rpm"]
                sim_state.pmp002_temp = p2_data["temperature_c"]
                sim_state.pmp002_power = p2_data["power_kw"]
                sim_state.pmp002_current = p2_data["current_a"]
                sim_state.pmp002_press = p2_data["pressure_bar"]
                sensor_level = safe_float("sensor_04", 500.0)

                raw_payload = {
                    "pmp001": p1_data,
                    "pmp002": p2_data,
                    "tank": {
                        "level_liters": sensor_level,
                        "v001_open": sim_state.v001_open
                    }
                }
                
                if mqtt_client.is_connected():
                    mqtt_client.publish(RAW_TOPIC, json.dumps(raw_payload))
            
        except Exception as e:
            print(f"MQTT Publisher: Error: {e}")
            
        await asyncio.sleep(1.0)

@app.on_event("startup")
async def startup_event():
    # Warm up file handle
    get_next_sensor_row()
    try:
        mqtt_client.connect(MQTT_BROKER, MQTT_PORT, 60)
        mqtt_client.loop_start()
        print("MQTT Client started loop.")
    except Exception as e:
        print(f"MQTT Startup: Broker connection failed: {e}")
    asyncio.create_task(publish_telemetry_loop())

class MockSimulation:
    def __init__(self):
        self.tank_max_capacity = 1000.0
        self.pmp001_max_flow = 50.0
        self.pmp002_max_flow = 50.0
        self.lah_limit = 90.0
        self.lal_limit = 10.0
        self.pmp_nominal_voltage = 400.0
        self.pmp_nominal_power = 4.0
        self.pmp_max_rpm = 1500.0
        self.ambient_temp = 25.0
        
        self.tank_level = 500.0
        self.pmp001_speed = 50.0
        self.pmp002_speed = 40.0
        self.v001_open = True
        self.interlock_tripped = False
        self.prev_in_alarm = False

        self.pit001_pressure = 2.0
        self.lit001_pct = 50.0
        self.fit001_flow = 20.0
        
        self.pmp001_bearing_wear = False
        self.pmp001_rpm = 750.0
        self.pmp001_temp = 35.0
        self.pmp001_power = 2.0
        self.pmp001_current = 3.0
        
        self.pmp002_rpm = 600.0
        self.pmp002_temp = 32.0
        self.pmp002_power = 1.6
        self.pmp002_current = 2.4
        self.pmp002_press = 1.2
        
        self.history = []
        
        self.logging_active = False
        self.pmp001_log_line_count = 0
        self.pmp001_log_size = 0
        self.pmp002_log_line_count = 0
        self.pmp002_log_size = 0

sim_state = MockSimulation()

@app.get("/api/simulation/status")
async def get_sim_status():
    import time, random
    # Update some dynamic mock values for realism
    if not sim_state.interlock_tripped:
        if sim_state.pmp001_speed > 0:
            sim_state.tank_level += (sim_state.pmp001_speed/100) * 5.0
            sim_state.pit001_pressure = 2.0 + (sim_state.pmp001_speed/100) * 1.5 + random.uniform(-0.1, 0.1)
        if sim_state.pmp002_speed > 0 and sim_state.v001_open and sim_state.tank_level > 0:
            sim_state.tank_level -= (sim_state.pmp002_speed/100) * 5.0
            sim_state.fit001_flow = (sim_state.pmp002_speed/100) * 30.0 + random.uniform(-0.5, 0.5)
        else:
            sim_state.fit001_flow = 0.0

    sim_state.tank_level = max(0.0, min(sim_state.tank_level, sim_state.tank_max_capacity))
    sim_state.lit001_pct = (sim_state.tank_level / sim_state.tank_max_capacity) * 100
    
    is_lah = sim_state.lit001_pct >= sim_state.lah_limit
    is_lal = sim_state.lit001_pct <= sim_state.lal_limit
    is_tah = (sim_state.ambient_temp + (sim_state.pmp001_speed/100)*20 + (10 if getattr(sim_state, "pmp001_bearing_wear", False) else 0)) >= 105 or (sim_state.ambient_temp + (sim_state.pmp002_speed/100)*20 + (10 if getattr(sim_state, "pmp002_bearing_wear", False) else 0)) >= 105
    is_pah = sim_state.pit001_pressure >= 5.0
    
    in_alarm = is_lah or is_lal or is_tah or is_pah
    
    if in_alarm and not sim_state.prev_in_alarm:
        sim_state.interlock_tripped = True
        if is_lah: sim_state.pmp001_speed = 0.0
        if is_lal: sim_state.pmp002_speed = 0.0
        
    sim_state.prev_in_alarm = in_alarm

    sim_state.history.append({
        "time": time.strftime("%H:%M:%S"),
        "tank_level_pct": sim_state.lit001_pct,
        "pit001_pressure": sim_state.pit001_pressure,
        "fit001_flow": sim_state.fit001_flow,
        "pmp001_power": (sim_state.pmp001_speed/100) * sim_state.pmp_nominal_power * (1.2 if getattr(sim_state, "pmp001_bearing_wear", False) else 1.0),
        "pmp001_rpm": (sim_state.pmp001_speed/100) * sim_state.pmp_max_rpm,
        "pmp001_temp": sim_state.ambient_temp + (sim_state.pmp001_speed/100)*20 + (10 if getattr(sim_state, "pmp001_bearing_wear", False) else 0),
        "pmp001_current": ((sim_state.pmp001_speed/100) * sim_state.pmp_nominal_power * 1000) / (sim_state.pmp_nominal_voltage * 1.732 * 0.85) if sim_state.pmp001_speed > 0 else 0,
        "pmp001_press": sim_state.pit001_pressure,
        "pmp002_power": (sim_state.pmp002_speed/100) * sim_state.pmp_nominal_power * (1.2 if getattr(sim_state, "pmp002_bearing_wear", False) else 1.0),
        "pmp002_rpm": (sim_state.pmp002_speed/100) * sim_state.pmp_max_rpm,
        "pmp002_temp": sim_state.ambient_temp + (sim_state.pmp002_speed/100)*20 + (10 if getattr(sim_state, "pmp002_bearing_wear", False) else 0),
        "pmp002_current": ((sim_state.pmp002_speed/100) * sim_state.pmp_nominal_power * 1000) / (sim_state.pmp_nominal_voltage * 1.732 * 0.85) if sim_state.pmp002_speed > 0 else 0,
        "pmp002_press": 0.0 if not sim_state.v001_open else sim_state.pit001_pressure * 0.5
    })
    if len(sim_state.history) > 60:
        sim_state.history.pop(0)

    import os, csv
    if sim_state.logging_active:
        now = time.time()
        if not hasattr(sim_state, "last_log_time"):
            sim_state.last_log_time = 0.0
        if now - sim_state.last_log_time >= 1.0:
            sim_state.last_log_time = now
            
            def write_csv(filename, pmp):
                file_exists = os.path.exists(filename)
                with open(filename, "a", newline="") as f:
                    writer = csv.writer(f)
                    if not file_exists:
                        writer.writerow(["Timestamp", "Power_kW", "Voltage_V", "Current_A", "Speed_RPM", "Temperature_C", "Pressure_bar"])
                    writer.writerow([time.strftime("%Y-%m-%d %H:%M:%S"), f"{pmp['power_kw']:.1f}", f"{pmp['voltage_v']:.1f}", f"{pmp['current_a']:.3f}", f"{pmp['speed_rpm']:.1f}", f"{pmp['temperature_c']:.1f}", f"{pmp['pressure_bar']:.2f}"])
                
                setattr(sim_state, f"{filename.split('_')[0]}_log_line_count", getattr(sim_state, f"{filename.split('_')[0]}_log_line_count") + 1)
                setattr(sim_state, f"{filename.split('_')[0]}_log_size", os.path.getsize(filename))
                
            write_csv("pmp001_pdm_dataset.csv", {
                "power_kw": (sim_state.pmp001_speed/100) * sim_state.pmp_nominal_power * (1.2 if getattr(sim_state, "pmp001_bearing_wear", False) else 1.0),
                "voltage_v": sim_state.pmp_nominal_voltage,
                "current_a": ((sim_state.pmp001_speed/100) * sim_state.pmp_nominal_power * 1000) / (sim_state.pmp_nominal_voltage * 1.732 * 0.85) if sim_state.pmp001_speed > 0 else 0,
                "speed_rpm": (sim_state.pmp001_speed/100) * sim_state.pmp_max_rpm,
                "temperature_c": sim_state.ambient_temp + (sim_state.pmp001_speed/100)*20 + (10 if getattr(sim_state, "pmp001_bearing_wear", False) else 0),
                "pressure_bar": sim_state.pit001_pressure
            })
            write_csv("pmp002_pdm_dataset.csv", {
                "power_kw": (sim_state.pmp002_speed/100) * sim_state.pmp_nominal_power * (1.2 if getattr(sim_state, "pmp002_bearing_wear", False) else 1.0),
                "voltage_v": sim_state.pmp_nominal_voltage,
                "current_a": ((sim_state.pmp002_speed/100) * sim_state.pmp_nominal_power * 1000) / (sim_state.pmp_nominal_voltage * 1.732 * 0.85) if sim_state.pmp002_speed > 0 else 0,
                "speed_rpm": (sim_state.pmp002_speed/100) * sim_state.pmp_max_rpm,
                "temperature_c": sim_state.ambient_temp + (sim_state.pmp002_speed/100)*20 + (10 if getattr(sim_state, "pmp002_bearing_wear", False) else 0),
                "pressure_bar": 0.0 if not sim_state.v001_open else sim_state.pit001_pressure * 0.5
            })

    active_alarms = []
    if sim_state.lit001_pct >= sim_state.lah_limit:
        active_alarms.append("LAH")
    if sim_state.lit001_pct <= sim_state.lal_limit:
        active_alarms.append("LAL")
    if (sim_state.ambient_temp + (sim_state.pmp001_speed/100)*20 + (10 if getattr(sim_state, "pmp001_bearing_wear", False) else 0)) >= 105:
        active_alarms.append("TAH")
    if sim_state.pit001_pressure >= 5.0:
        active_alarms.append("PAH")

    return {
        "tank_max_capacity": sim_state.tank_max_capacity,
        "pmp001_max_flow": sim_state.pmp001_max_flow,
        "pmp002_max_flow": sim_state.pmp002_max_flow,
        "lah_limit": sim_state.lah_limit,
        "lal_limit": sim_state.lal_limit,
        "pmp_nominal_voltage": sim_state.pmp_nominal_voltage,
        "pmp_nominal_power": sim_state.pmp_nominal_power,
        "pmp_max_rpm": sim_state.pmp_max_rpm,
        "ambient_temp": sim_state.ambient_temp,
        "tank_level": sim_state.tank_level,
        "pmp001_speed": sim_state.pmp001_speed,
        "pmp002_speed": sim_state.pmp002_speed,
        "v001_open": sim_state.v001_open,
        "interlock_tripped": sim_state.interlock_tripped,
        "prev_in_alarm": sim_state.prev_in_alarm,
        "active_alarms": active_alarms,
        "pit001_pressure": sim_state.pit001_pressure,
        "lit001_pct": sim_state.lit001_pct,
        "fit001_flow": sim_state.fit001_flow,
        "logging_active": sim_state.logging_active,
        "pmp001_log_line_count": getattr(sim_state, "pmp001_log_line_count", 0),
        "pmp001_log_size": getattr(sim_state, "pmp001_log_size", 0),
        "pmp002_log_line_count": getattr(sim_state, "pmp002_log_line_count", 0),
        "pmp002_log_size": getattr(sim_state, "pmp002_log_size", 0),
        "pmp001": {
            "bearing_wear": getattr(sim_state, "pmp001_bearing_wear", False),
            "speed_rpm": sim_state.pmp001_rpm,
            "power_kw": sim_state.pmp001_power,
            "voltage_v": sim_state.pmp_nominal_voltage,
            "current_a": sim_state.pmp001_current,
            "temperature_c": sim_state.pmp001_temp,
            "pressure_bar": sim_state.pit001_pressure
        },
        "pmp002": {
            "bearing_wear": getattr(sim_state, "pmp002_bearing_wear", False),
            "speed_rpm": sim_state.pmp002_rpm,
            "power_kw": sim_state.pmp002_power,
            "voltage_v": sim_state.pmp_nominal_voltage,
            "current_a": sim_state.pmp002_current,
            "temperature_c": sim_state.pmp002_temp,
            "pressure_bar": sim_state.pmp002_press
        }
    }

@app.get("/api/simulation/history")
async def get_sim_history():
    return sim_state.history

@app.post("/api/simulation/controls")
async def update_sim_controls(req: Request):
    data = await req.json()
    if "pmp001_speed" in data: sim_state.pmp001_speed = float(data["pmp001_speed"])
    if "pmp002_speed" in data: sim_state.pmp002_speed = float(data["pmp002_speed"])
    if "v001_open" in data: sim_state.v001_open = bool(data["v001_open"])
    if "pmp001_bearing_wear" in data: setattr(sim_state, "pmp001_bearing_wear", bool(data["pmp001_bearing_wear"]))
    if "pmp002_bearing_wear" in data: setattr(sim_state, "pmp002_bearing_wear", bool(data["pmp002_bearing_wear"]))
    return {"status": await get_sim_status()}

@app.post("/api/simulation/config")
async def update_sim_config(req: Request):
    data = await req.json()
    if "tank_max_capacity" in data: sim_state.tank_max_capacity = float(data["tank_max_capacity"])
    if "lah_limit" in data: sim_state.lah_limit = float(data["lah_limit"])
    if "lal_limit" in data: sim_state.lal_limit = float(data["lal_limit"])
    if "pmp_nominal_voltage" in data: sim_state.pmp_nominal_voltage = float(data["pmp_nominal_voltage"])
    if "ambient_temp" in data: sim_state.ambient_temp = float(data["ambient_temp"])
    return {"status": await get_sim_status()}

@app.post("/api/simulation/reset-interlock")
async def reset_interlock():
    sim_state.interlock_tripped = False
    return {"status": await get_sim_status()}

@app.post("/api/simulation/wipe-history")
async def wipe_history():
    sim_state.history = []
    return {"status": await get_sim_status()}

@app.post("/api/simulation/logging/toggle")
async def toggle_logging():
    sim_state.logging_active = not sim_state.logging_active
    return {"status": await get_sim_status()}

@app.delete("/api/simulation/logs")
async def delete_logs():
    import os
    if os.path.exists("pmp001_pdm_dataset.csv"): os.remove("pmp001_pdm_dataset.csv")
    if os.path.exists("pmp002_pdm_dataset.csv"): os.remove("pmp002_pdm_dataset.csv")
    sim_state.pmp001_log_line_count = 0
    sim_state.pmp001_log_size = 0
    sim_state.pmp002_log_line_count = 0
    sim_state.pmp002_log_size = 0
    return {"status": await get_sim_status()}
