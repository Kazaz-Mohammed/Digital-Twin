import asyncio
import random
import time
from typing import List, Dict, Any
from fastapi import FastAPI, UploadFile, File, WebSocket, WebSocketDisconnect, Depends, HTTPException, status
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
    
    # Reset progress file in temp directory (avoids uvicorn reload loop)
    try:
        progress_path = os.path.join(tempfile.gettempdir(), "pid_extraction_progress.json")
        with open(progress_path, "w") as f:
            json.dump({"percent": 0, "status": "Initializing extraction..."}, f)
    except Exception:
        pass

    try:
        with open(temp_file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        python_exe = sys.executable
        default_model_path = os.path.abspath(os.path.join(
            os.path.dirname(__file__),
            "..", "..", "..", "MLOpsManufacturing-main", "samples", "amlv2_pid_symbol_detection_train", "src", "app", "runs", "detect", "train-7", "weights", "best.pt"
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
