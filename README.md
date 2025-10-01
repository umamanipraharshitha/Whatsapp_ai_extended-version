# WhatsApp AI Health Assistant (RAG + Reminders)

A **WhatsApp-based AI assistant** that combines **medication reminders** with **Retrieval-Augmented Generation (RAG) for health Q/A**. Users can schedule, list, and cancel reminders via WhatsApp while asking health-related questions that are answered using a **medical knowledge base**.

---

## 🚀 Features

### Medication Reminders

* Schedule reminders using natural language:

  * *Example:* “Remind me to take 2 tablets of Paracetamol at 9 AM tomorrow.”
* List all scheduled reminders with IDs.
* Cancel reminders by ID.
* Automatic persistence for each user’s medications.

### Health Q/A (RAG)

* Users ask general health questions via WhatsApp.
* **Vector embedding** retrieves relevant documents from ChromaDB.
* **Google Gemini** generates context-aware responses.
* Automatic escalation for urgent situations (e.g., “emergency”, “call doctor”).

### Quick Opt-Out

* Users can unsubscribe from all reminders with `stop reminders` or `unsubscribe`.

---

## 🛠 Technical Flow

```mermaid
flowchart TD
    A[User WhatsApp Message] --> B{Message Type?}
    B -->|Reminder| C[Parse Medication Request]
    C --> D[Schedule Reminder & Store in DB]
    D --> E[Send Confirmation via WhatsApp]
    B -->|Q/A| F[Embed Query]
    F --> G[Retrieve Relevant Docs from ChromaDB]
    G --> H[Generate Response using Google Gemini]
    H --> E
```

---

## 🧰 Technologies Used

| Layer          | Technology                   |
| -------------- | ---------------------------- |
| Backend        | Node.js, Express             |
| Messaging      | Twilio WhatsApp API          |
| AI / RAG       | Google Gemini, @google/genai |
| Vector DB      | ChromaDB                     |
| Scheduler      | node-schedule, bullmq        |
| Job Queue      | Redis                        |
| Env Management | dotenv                       |
| Tunneling      | Cloudflare Tunnel (Optional) |

---

## ⚡ Setup

1. **Clone the repository**

```bash
git clone <repo-url>
cd gemini-rag-whatsapp
```

2. **Install dependencies**

```bash
npm install
```

3. **Google Service Account**

* Download JSON key from Google Cloud.
* Set environment variable:

```bash
set GOOGLE_APPLICATION_CREDENTIALS=C:\path\to\key.json
```

4. **Configure `.env`**

PORT=3000
TWILIO_ACCOUNT_SID=<--->
TWILIO_AUTH_TOKEN=<--->
TWILIO_WHATSAPP_NUMBER=<--->
GEMINI_API_KEY=<--->
GEMINI_EMBEDDING_MODEL=<--->
GEMINI_LLM_MODEL=<--->

REDIS_URL=redis://127.0.0.1:6379
BASE_URL=http://localhost:3000
CHROMA_DB_DIR=./chroma-data
MOCK_WHATSAPP=false
GOOGLE_APPLICATION_CREDENTIALS=



5. **Start Server**

```bash
node --env-file=.env index.js
```

6. **Optional: Expose Localhost for WhatsApp**

```bash
cloudflared tunnel --url http://localhost:3000
```

* Use generated URL as Twilio webhook.

---

## 💻 Usage & Screenshots

### 1. Scheduling a Reminder

![Working](screenshots/working.jpg)

### 2. Console Logs

![Console](screenshots/console.jpg)

### 3. RAG-based Answer

* User asks: “What are the side effects of Paracetamol?”
* AI replies with context from the medical knowledge base.

![RAG Answer](screenshots/rag-answer.png)

*Add this screenshot if you capture the AI response from WhatsApp.*

---

## 🌟 Highlights

* **RAG-Powered:** Reduces hallucinations by combining vector search + generative AI.
* **Real-Time Reminders:** Natural language scheduling via WhatsApp.
* **Extensible:** Add more medical documents or AI models easily.
* **Quick Setup:** Cloudflare tunnel for testing without deployment.

---

