# Step-by-step: Run Mock WhatsApp + API + Client (all local)

Use this when you want to run **all three** on your machine: **Mock WhatsApp**, **API server**, and **Client app**.

---

## Ports (default)

| App            | URL                      | Port  |
|----------------|--------------------------|-------|
| Mock WhatsApp  | http://localhost:9999    | 9999  |
| API server     | http://localhost:3000    | 3000  |
| Client (Vite)  | http://localhost:5173    | 5173  |

---

## Step 1: Point the API server at the mock

The API server must call the **mock** instead of Meta when sending WhatsApp messages.

1. Open the **server** `.env` file:  
   `server/.env`
2. Add or edit:
   ```env
   META_GRAPH_URL=http://localhost:9999
   ```
   (No trailing slash. Do **not** add `/v21.0` — the server adds the version path.)
3. Save the file.

If you use a different mock port (e.g. via `MOCK_WHATSAPP_PORT`), use that port in `META_GRAPH_URL` (e.g. `http://localhost:9998`).

---

## Step 2: Start the Mock WhatsApp server

1. Open a terminal.
2. Go to the mock folder:
   ```bash
   cd mock-whatsapp
   ```
3. Install (first time only):
   ```bash
   npm install
   ```
4. Start the mock:
   ```bash
   npm run dev
   ```
5. You should see something like:
   ```
   [Mock WhatsApp] Server running at http://localhost:9999
   [Mock WhatsApp] Web UI:            http://localhost:9999/
   ```
6. Leave this terminal running. Open a **second** terminal for the next steps.

---

## Step 3: Start the API server

1. In a **new** terminal, go to the **server** folder:
   ```bash
   cd server
   ```
   (From the project root: `cd "f:\AntiGravity projects\PBooksPro\server"` or your path.)
2. Install (first time only):
   ```bash
   npm install
   ```
3. Start the API:
   ```bash
   npm run dev
   ```
4. Wait until you see:
   ```
   🚀 API server running on http://0.0.0.0:3000
   ```
5. Leave this terminal running. Open a **third** terminal for the client.

---

## Step 4: Start the client app

1. In a **new** terminal, go to the **project root** (where `package.json` and `vite.config.ts` are):
   ```bash
   cd "f:\AntiGravity projects\PBooksPro"
   ```
2. Install (first time only):
   ```bash
   npm install
   ```
3. Start the client:
   ```bash
   npm run dev
   ```
4. Note the URL (usually):
   ```
   Local:   http://localhost:5173/
   ```
5. Open **http://localhost:5173** in your browser and log in if needed.

---

## Step 5: Configure the Mock WhatsApp webhook

The mock must know where to send simulated incoming messages (your API’s webhook).

1. In the browser, open the **Mock WhatsApp UI**:  
   **http://localhost:9999**
2. In the **Configuration** section:
   - **Main app webhook URL**: set to  
     `http://localhost:3000/api/whatsapp/webhook`
   - Click **Load config** to load current values (optional).
   - Click **Save config**.
3. You should see a success message. Leave the mock UI open if you want to simulate messages later.

---

## Step 6: Configure WhatsApp in the client app

In the **client app** (http://localhost:5173):

1. Go to **Settings** (or wherever **WhatsApp** configuration is in your app).
2. Open the **WhatsApp** / **WhatsApp Business API** configuration.
3. Enter values that **match the mock**:

   | Field            | Value                     |
   |------------------|---------------------------|
   | **API key**      | Any value (e.g. `mock-token`) |
   | **Phone number ID** | `MOCK_PHONE_NUMBER_ID`  |
   | **Verify token** | `mock-verify-token`       |
   | **Webhook URL**  | Optional for local mock. If your app asks for it, you can use `http://localhost:3000/api/whatsapp/webhook` (the mock will POST here). |

4. Save the configuration.
5. If the app has a **Test connection** button, use it. It should call the mock and succeed.

---

## Step 7: Test the flow

### A. Send a message from the client app (app → mock)

1. In the client app, open WhatsApp / chat and send a message to a contact (use a phone number like `15551234567`).
2. The API server will call the **mock** at `http://localhost:9999/v21.0/.../messages`.
3. In the **Mock UI** (http://localhost:9999), open **Message log** and click **Refresh**. You should see the outgoing message.

### B. Simulate an incoming message (mock → app)

1. In the **Mock UI** (http://localhost:9999), go to **Send message to main app**.
2. **From**: e.g. `15551234567`.
3. **Message text**: e.g. `Hello from mock`.
4. Click **Send to main app**.
5. The mock will POST to `http://localhost:3000/api/whatsapp/webhook`. The API will process it and you should see the message in the client app’s WhatsApp/chat (refresh or open the conversation if needed).

---

## Summary checklist

- [ ] **Server** `.env`: `META_GRAPH_URL=http://localhost:9999`
- [ ] **Mock** running at http://localhost:9999 (`npm run dev` in `mock-whatsapp`)
- [ ] **Mock UI** webhook URL set to `http://localhost:3000/api/whatsapp/webhook` and **Save config**
- [ ] **API** running at http://localhost:3000 (`npm run dev` in `server`)
- [ ] **Client** running at http://localhost:5173 (`npm run dev` in project root)
- [ ] **Client** WhatsApp config: Phone number ID = `MOCK_PHONE_NUMBER_ID`, Verify token = `mock-verify-token`, API key = any

---

## Troubleshooting

- **“Test connection” fails**  
  - Ensure the **mock** is running (http://localhost:9999/health should return `{"ok":true}`).  
  - Ensure `META_GRAPH_URL=http://localhost:9999` is in `server/.env` and the API was restarted after adding it.

- **Send from app doesn’t show in mock**  
  - Check API server logs; it should be calling the mock.  
  - In the client, ensure WhatsApp is configured with **Phone number ID** = `MOCK_PHONE_NUMBER_ID`.

- **Simulated message doesn’t appear in the app**  
  - In the Mock UI, ensure **Main app webhook URL** is exactly `http://localhost:3000/api/whatsapp/webhook` and you clicked **Save config**.  
  - Check API server logs for webhook POSTs and any errors.

- **Client can’t reach API**  
  - With the client at http://localhost:5173, it uses http://localhost:3000/api by default.  
  - If you use a different port for the API, set `VITE_API_URL` (e.g. in a root `.env`) to `http://localhost:YOUR_PORT/api`.
