Scolia API Integration (Backend)

Scolia Social API – Official Documentation
Version: v1.2
Base WebSocket URL: wss://game.scoliadarts.com/api/v1/social

To connect, use query parameters:
serialNumber: Board serial
accessToken: Authentication token
Example connection: wss://game.scoliadarts.com/api/v1/social?serialNumber=ABC123&accessToken=XYZ456

WebSocket Communication

Messages From Scolia
HELLO_CLIENT – Connection established
THROW_DETECTED – Dart thrown
SBC_STATUS_CHANGED – Status updated
TAKEOUT_STARTED, TAKEOUT_FINISHED – Dart removal
SBC_CONFIGURATION, CAMERA_IMAGES
ACKNOWLEDGED, REFUSED

Messages To Scolia
GET_SBC_STATUS
RECALIBRATE
RESET_PHASE
THROW_CORRECTED
DELETE_THROW
CONFIGURE_SBC
GET_CAMERA_IMAGES
GET_SBC_CONFIGURATION
Example – THROW_DETECTED
{ "type": "THROW_DETECTED", "id": "UUID", "payload": { "sector": "T20", "coordinates": [10, -5], "angle": { "vertical": 80, "horizontal": 87 }, "bounceout": false, "detectionTime": "2024-01-01T12:34:56Z" } }

REST API Endpoints
GET /api/social/boards – List connected boards
PUT /api/social/boards – Connect a board { "serialNumber": "123-ABC" }
DELETE /api/social/boards/{serialNumber} – Disconnect board

Status & Phase Values
Status:
Offline, Updating, Initializing, Calibrating, Ready, Error
Phase:
Throw: Board is accepting throws
Takeout: Waiting for darts to be removed
null: Idle or not ready

WebSocket Close Codes
4000: Ping timeout
4100: Invalid serial number
4101: Board already connected
4102: Invalid access token

Implement:
- WebSocket reconnection logic
- Event parsing + rebroadcast to `gameUpdate`
- Safe error handling and retries

---
