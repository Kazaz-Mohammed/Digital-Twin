import paho.mqtt.client as mqtt
import json

def on_connect(client, userdata, flags, rc):
    print(f"Connected to Mosquitto with result code {rc}")
    # Subscribe to ALL topics to catch anything Kepware might send
    client.subscribe("#")
    print("Subscribed to ALL topics (#). Waiting for ANY message...")

def on_message(client, userdata, msg):
    print(f"\n=== MESSAGE ON TOPIC: [{msg.topic}] ===")
    try:
        payload = json.loads(msg.payload.decode())
        print(json.dumps(payload, indent=2))
    except Exception:
        print(f"Raw Payload: {msg.payload.decode()}")

client = mqtt.Client()
client.on_connect = on_connect
client.on_message = on_message

print("Connecting to 127.0.0.1:1883...")
client.connect("127.0.0.1", 1883, 60)
client.loop_forever()
