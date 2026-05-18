# n8n-nodes-variable

A community node package for [n8n](https://n8n.io) that provides local and global variable management for workflow automation — without needing Code nodes.

---

## What this node does

The **Variable** node lets you store, retrieve, update, and delete named variables anywhere in a workflow. Variables can be scoped to:

- **Local (This Execution)** — lives only for the current run, stored on the item's JSON data
- **Workflow Global** — persists across executions using n8n's workflow static data
- **Node Local** — persists for the specific node instance
- **Custom Namespace** — workflow global storage with a fully dynamic namespace string (great for per-user / per-guild data)
- **Cross-Workflow (Shared)** — variables are stored in a local JSON file and shared across **all** workflows on this n8n instance
- **Cross-Workflow (Data Tables)** — variables are stored in n8n's built-in **Data Tables**, visible in the Data Tables UI tab and accessible from any workflow via the n8n API

---

## Installation

### Community node (recommended)

1. In n8n, go to **Settings → Community Nodes**
2. Click **Install**
3. Enter `n8n-nodes-variable` and confirm

### Manual install (self-hosted)

```bash
cd ~/.n8n/custom       # or your N8N_CUSTOM_EXTENSIONS path
npm install n8n-nodes-variable
```

Then restart n8n.

---

## Operations

| Operation | Description |
|---|---|
| **Set Variable** | Create or update a variable |
| **Get Variable** | Retrieve a variable value |
| **Delete Variable** | Remove a variable |
| **Has Variable** | Check whether a variable exists (returns boolean) |
| **List Variables** | List all keys (and optionally values) in a namespace |
| **Clear Variables** | Delete all variables in a namespace (requires confirmation) |
| **Increment Variable** | Add a number to a numeric variable |
| **Decrement Variable** | Subtract a number from a numeric variable |
| **Append to Array** | Push a value onto an array variable |
| **Merge Object** | Merge a JSON object into an object variable |
| **Toggle Boolean** | Flip a boolean variable between `true` and `false` |

---

## Scopes explained

### Local (This Execution)

Variables are stored directly on the item's JSON under `_variables` (configurable). They pass forward through subsequent nodes in the same execution and are gone when the execution ends.

```json
{
  "name": "Alice",
  "_variables": {
    "default": {
      "step": 3,
      "seen": true
    }
  }
}
```

### Workflow Global

Variables persist across executions using n8n's [workflow static data](https://docs.n8n.io/code/cookbook/builtin/get-workflow-static-data/). Stored under:

```
staticData.n8nNodesVariable.namespaces[namespace].variables[key]
```

This is suitable for light-to-moderate state such as counters, flags, and small data objects.

### Node Local

Like Workflow Global but scoped to the specific node instance. Useful for node-level state that should not conflict with other Variable nodes in the same workflow.

### Custom Namespace

Uses Workflow Global storage with a fully expression-capable namespace string. Ideal for per-entity state in Discord bots and similar automation:

```
economy          → balance per user
cooldowns        → command cooldown per guild+user
guild_{{$json.guild.id}} → per-guild settings
```

### Cross-Workflow (Shared)

Variables are stored in a JSON file on the n8n host at:

```
${N8N_USER_FOLDER ?? ~/.n8n}/n8n-nodes-variable-data.json
```

The file is **created automatically on first use** — no setup or dependencies required. Writes are performed atomically (write to a temporary file, then rename) to prevent corruption. Data survives instance restarts and is accessible from any workflow on the same n8n instance.

> **Note:** the file lives on the n8n host machine. If you run n8n in a container or cloud environment, ensure the `.n8n` data directory is persisted to a volume so data is not lost on container restarts.

### Cross-Workflow (Data Tables)

Variables are stored as rows in an n8n **Data Table**, making them visible and editable directly in the n8n UI under the **Data Tables** tab.

Each namespace maps to one table named `var_<namespace>` (e.g., namespace `global_stats` → table `var_global_stats`). The table is **created automatically on first use**. Each row stores a `key` and a `value` (JSON-serialised).

#### Prerequisites

1. **Enable the n8n API** — in your n8n instance go to **Settings → API** and create an API key.
2. **Create a credential** — add a new credential of type **n8n Variable Node API** and enter:
   - **n8n Instance URL** — the base URL your n8n instance is reachable at *from within the n8n process itself* (e.g. `http://localhost:5678` for local/Docker installs, or `https://your-instance.example.com` for cloud).
   - **API Key** — the key generated in step 1.
3. In the Variable node, set **Scope** to **Cross-Workflow (Data Tables)** and select the credential.

#### What gets stored

| Column | Content |
|---|---|
| `key` | The variable key string |
| `value` | The variable value, JSON-serialised (numbers, booleans, arrays, and objects all round-trip correctly) |

> **Tip:** Because the data lives in a real Data Table you can query it with the built-in **n8n Data Table** node, view and edit it in the UI, and use it as a lightweight shared datastore without any external database.

> **Note for Docker users:** HTTP calls made by the Variable node originate from inside the container. Use `http://localhost:5678` (or the container's own hostname/service name in Docker Compose) as the base URL — not the external host address.

---

## Examples

### 1. Set a local variable and get it later

**Node 1 — Set (Local Execution)**
- Operation: `Set Variable`
- Scope: `Local (This Execution)`
- Key: `stepCount`
- Value Type: `Number`
- Value: `1`

**Node 2 — Get (Local Execution)**
- Operation: `Get Variable`
- Scope: `Local (This Execution)`
- Key: `stepCount`
- Output Field Name: `currentStep`

The output item will have `currentStep: 1`.

---

### 2. Set a workflow global counter

**Increment on every execution:**
- Operation: `Increment Variable`
- Scope: `Workflow Global`
- Namespace: `stats`
- Key: `runCount`
- Amount: `1`
- Initialize If Missing: `true`
- Initial Value: `0`

The variable `stats.runCount` persists between executions and increments each time the workflow runs.

---

### 3. Discord bot: user balance (economy system)

**Set balance when a user earns coins:**
- Operation: `Set Variable`
- Scope: `Custom Namespace`
- Custom Namespace: `economy`
- Key: `balance_{{$json.user.id}}`
- Value Type: `Number`
- Value: `{{$json.amount}}`

**Get balance when displaying it:**
- Operation: `Get Variable`
- Scope: `Custom Namespace`
- Custom Namespace: `economy`
- Key: `balance_{{$json.user.id}}`
- Use Default Value: `true`
- Default Value: `0`

**Increment after earning:**
- Operation: `Increment Variable`
- Scope: `Custom Namespace`
- Custom Namespace: `economy`
- Key: `balance_{{$json.user.id}}`
- Amount: `{{$json.coinsEarned}}`

---

### 4. Discord bot: cooldown tracking

**Set a cooldown flag:**
- Operation: `Set Variable`
- Scope: `Custom Namespace`
- Custom Namespace: `cooldowns`
- Key: `cmd_{{$json.guild.id}}_{{$json.user.id}}`
- Value Type: `Number`
- Value: `{{Date.now()}}`
- Overwrite If Exists: `true`

**Check if cooldown is active:**
- Operation: `Has Variable`
- Scope: `Custom Namespace`
- Custom Namespace: `cooldowns`
- Key: `cmd_{{$json.guild.id}}_{{$json.user.id}}`

---

### 5. Cross-workflow shared counter

Count total webhook hits across every workflow on the instance:

**In each workflow that receives a webhook — Increment shared counter:**
- Operation: `Increment Variable`
- Scope: `Cross-Workflow (Shared)`
- Namespace: `global_stats`
- Key: `webhook_hits`
- Amount: `1`
- Initialize If Missing: `true`
- Initial Value: `0`

**In a reporting workflow — Read the counter:**
- Operation: `Get Variable`
- Scope: `Cross-Workflow (Shared)`
- Namespace: `global_stats`
- Key: `webhook_hits`

Because the database is shared, all workflows see and update the same value.

---

### 6. Cross-workflow shared counter (Data Tables)

Same counter as example 5, but stored in n8n Data Tables so you can see and edit the value in the UI.

**Prerequisites:** Create an **n8n Variable Node API** credential (see the *Cross-Workflow (Data Tables)* scope section above).

**Increment on each webhook hit:**
- Operation: `Increment Variable`
- Scope: `Cross-Workflow (Data Tables)`
- Credential: *(select your n8n Variable Node API credential)*
- Namespace: `global_stats`
- Key: `webhook_hits`
- Amount: `1`
- Initialize If Missing: `true`
- Initial Value: `0`

**Read the counter from any other workflow:**
- Operation: `Get Variable`
- Scope: `Cross-Workflow (Data Tables)`
- Credential: *(same credential)*
- Namespace: `global_stats`
- Key: `webhook_hits`

n8n automatically creates a Data Table called `var_global_stats` with `key` and `value` columns. You can inspect or edit the data at any time from the **Data Tables** tab in the n8n sidebar.

---

| Mode | Description |
|---|---|
| **Preserve Input + Add Result** _(default)_ | Keep all input fields and add a result object at `variable` (or your chosen field name) |
| **Result Only** | Output only the operation result object |
| **Add / Update Field** | Set a single field on the input item with just the variable's value |

### Example result object

```json
{
  "variable": {
    "operation": "get",
    "scope": "customNamespace",
    "namespace": "economy",
    "key": "balance_123456789",
    "value": 500,
    "exists": true
  }
}
```

---

## Limitations and concurrency warning

Workflow Global and Node Local variables use n8n's static data, which is:

- **Suitable for:** counters, feature flags, small state objects, per-user values in low-traffic bots
- **Not suitable for:** high-concurrency write operations (e.g., simultaneously updating the same counter from hundreds of parallel executions)
- **Not cross-workflow:** Workflow Global and Node Local variables are scoped to the workflow they belong to. Use the **Cross-Workflow (Shared)** scope to share state across workflows.

For high-volume or high-concurrency state, consider using a dedicated database node (Redis, Postgres, MongoDB) instead.

---

## Development

```bash
git clone <your-repo>
cd n8n-nodes-variable
npm install
npm run build
npm test
```

### Linking to a local n8n instance

```bash
# In the package directory
npm run build
npm link

# In your n8n custom nodes directory (~/.n8n/custom)
npm link n8n-nodes-variable
```

Then restart n8n and search for **Variable** in the nodes panel.

### Manual validation workflow

After linking:

1. Create a new workflow
2. Add **Manual Trigger**
3. Add **Variable** → Set Variable, Local Execution, Key: `myVar`, Value: `hello`
4. Add **Variable** → Get Variable, Local Execution, Key: `myVar`
5. Add **Variable** → Increment Variable, Workflow Global, Namespace: `stats`, Key: `runCount`
6. Add **Variable** → List Variables, Workflow Global, Namespace: `stats`
7. Execute and verify the output of each step

---

## License

MIT
