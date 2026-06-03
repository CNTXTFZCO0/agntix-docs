# Screenshot Shotlist for the v1 Dashboard Guides

These are the screenshots referenced by the 4 rewritten guides. Capture them from
the Agentix dashboard (`https://app.agntix.ai` or your local instance) and drop
the files in the folders below with these exact filenames.

Conventions:

- Format: PNG, retina (2x). Crop to the relevant UI region — don't include the
  whole desktop.
- Redact any real account / customer data (use a throwaway agent / number /
  knowledge store).
- File names are kebab-case, lowercase, no spaces.

---

## `build-your-first-agent/`

| Filename                        | What to capture |
|---------------------------------|-----------------|
| `01-agents-list-empty.png`      | The `/agents` page (Topbar shows "Agents", empty or near-empty list). Highlight the **+ Create Agent** button. |
| `02-create-agent-modal.png`     | The **Create New Agent** dialog — single screen with **Name**, **Language**, and the **Voice Enabled** toggle, plus the **Create Agent** button. (Creation is one step — there is no template/multi-step wizard.) |
| `03-agent-detail-overview.png`  | `/agents/[id]` — header (**Test Agent** button + **Save Changes**), left column **System Prompt**, right column tab strip (Calls / Chat / Behavior / Functions / Multi-agents / Analytics / Widgets). |
| `04-test-agent-button.png`      | Close-up of the green **Test Agent** button in the header. |

## `voice-calls/`

| Filename                              | What to capture |
|---------------------------------------|-----------------|
| `01-voice-enabled-toggle.png`         | `/agents/[id]` with the **Voice Enabled** toggle (top-right of the General Settings card) turned on. |
| `02-model-type-pipeline.png`          | The **Model Type** select expanded showing "Pipeline (STT → LLM → TTS)" and "Speech-to-Speech". |
| `03-calls-tab-tts-stt.png`            | The **Calls** tab open on the right column with TTS Provider + Model + Voice pickers and STT Provider + Model pickers visible. |
| `04-voice-picker.png`                 | The voice dropdown expanded showing the list of voices (close-up). |
| `05-test-agent-livekit.png`           | LiveKit room widget that appears in the header after clicking **Test Agent** (microphone + disconnect controls). |
| `06-phone-numbers-import.png`         | `/phone-numbers` page with the **Import** modal open — step 1 of the BYON flow. |
| `07-phone-attach-agent.png`           | The phone number row with inbound/outbound agent attached (the agent name visible in the table). |
| `08-initiate-outbound-call.png`       | The **Initiate Outbound Call** modal — customer phone number field + Call button. |

## `chat-with-rag/`

| Filename                                  | What to capture |
|-------------------------------------------|-----------------|
| `01-knowledge-store-empty.png`            | `/knowledge-store` page in its empty state (Topbar = "Knowledge Store", side panel empty, **+** button highlighted). |
| `02-create-store-modal.png`               | The **Create Knowledge Store** modal with the Name field filled in. |
| `03-upload-document-dropdown.png`         | The store detail page with the **Add** dropdown open showing "Upload file" / "Add website". |
| `04-upload-progress.png`                  | Document upload in progress (or "Processing" status badge on a freshly uploaded file). |
| `05-document-ready.png`                   | A document row with status = "Ready" / processed. |
| `07-test-rag-response.png`                | A chat in the Test Agent panel or the SDK demo page where the agent answered using the knowledge store (cite the source if shown). |

> Note: there is no `06-agent-attach-knowledge.png` shot — attaching a store to an agent is API-only in the current release (the in-dashboard **Knowledge** tab is disabled), so Step 4 of the guide has no screenshot.

## `tools/`

| Filename                       | What to capture |
|--------------------------------|-----------------|
| `01-tools-list-empty.png`      | `/tools` page (Topbar = "Tools"), empty list, **+ Create Tool** button highlighted. |
| `02-create-tool-modal-api.png` | Create Tool modal with **Type = API Tool**, Name + Description filled, URL + Method visible. |
| `03-headers-params.png`        | The expanded Headers section of the modal with one header (e.g. `Authorization: Bearer …`) added. |
| `04-schema-builder.png`        | The JSON Schema builder modal — at least one property defined (e.g. `orderId: string`). |
| `05-api-test-success.png`      | The **Test API** side sheet showing a successful 200 response. |
| `06-attach-tool-to-agent.png`  | `/agents/[id]` → **Functions** tab → the **Custom Tools** card with the new tool listed. |
| `07-test-call-tool-fired.png`  | Test Agent transcript / call log showing the tool firing with its arguments. |
