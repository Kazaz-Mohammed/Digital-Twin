from typing import List, Dict, Any
from app.models.text_detection.symbol_and_text_associated import SymbolAndTextAssociated
from app.models.graph_construction.connected_symbols_item import ConnectedSymbolsItem
from app.models.graph_construction.connected_symbols_connection_item import ConnectedSymbolsConnectionItem
from app.models.bounding_box import BoundingBox
from app.models.enums.flow_direction import FlowDirection
import logger_config

logger = logger_config.get_logger(__name__)

def parse_vlm_connections(
    vlm_output_connections: List[Dict[str, Any]],
    symbols: List[SymbolAndTextAssociated]
) -> List[ConnectedSymbolsItem]:
    """
    Translates raw VLM-detected connections (from_id -> to_id) into a list of ConnectedSymbolsItem objects.
    Ensures connectivity is bidirectional (undirected) and filters out invalid/hallucinated IDs.
    """
    # 1. Create mapping of ID -> Symbol
    symbol_map = {s.id: s for s in symbols}
    
    # 2. Build adjacency list of connections
    adjacency: Dict[int, set] = {s.id: set() for s in symbols}
    
    for conn in vlm_output_connections:
        from_id = conn.get("from_id")
        to_id = conn.get("to_id")
        
        # Validate that both IDs are known symbols
        if from_id in symbol_map and to_id in symbol_map:
            if from_id != to_id:  # Avoid self-loops
                adjacency[from_id].add(to_id)
                adjacency[to_id].add(from_id)
        else:
            logger.warning(f"Discarding invalid connection: {from_id} -> {to_id}")
            
    # 3. Build ConnectedSymbolsItem list
    output: List[ConnectedSymbolsItem] = []
    
    for symbol_id, connected_ids in adjacency.items():
        # Get source symbol details
        source_symbol = symbol_map[symbol_id]
        
        connections_list: List[ConnectedSymbolsConnectionItem] = []
        for target_id in connected_ids:
            target_symbol = symbol_map[target_id]
            
            # Map target symbol into ConnectedSymbolsConnectionItem
            conn_item = ConnectedSymbolsConnectionItem(
                id=target_symbol.id,
                label=target_symbol.label,
                text_associated=target_symbol.text_associated if target_symbol.text_associated else "",
                bounding_box=BoundingBox(
                    topX=target_symbol.topX,
                    topY=target_symbol.topY,
                    bottomX=target_symbol.bottomX,
                    bottomY=target_symbol.bottomY
                ),
                flow_direction=FlowDirection.unknown,
                segments=[]  # VLM parses top-level connectivity; segment coordinates not required by dashboard
            )
            connections_list.append(conn_item)
            
        symbol_item = ConnectedSymbolsItem(
            id=source_symbol.id,
            label=source_symbol.label,
            text_associated=source_symbol.text_associated if source_symbol.text_associated else "",
            bounding_box=BoundingBox(
                topX=source_symbol.topX,
                topY=source_symbol.topY,
                bottomX=source_symbol.bottomX,
                bottomY=source_symbol.bottomY
            ),
            connections=connections_list
        )
        output.append(symbol_item)
        
    return output
