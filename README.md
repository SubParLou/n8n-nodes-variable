# n8n-nodes-variable

A community node package for [n8n](https://n8n.io) that provides inventor.bot-style local and global variable management for workflow automation — without needing Code nodes.

---

## What this node does

The **Variable** node lets you store, retrieve, update, and delete named variables anywhere in a workflow. Variables can be scoped to:

- **Local (This Execution)** — lives only for the current run, stored on the item's JSON data
- **Workflow Global** — persists across executions using n8n's workflow static data
- **Node Local** — persists for the specific node instance
- **Custom Namespace** — workflow global storage with a fully dynamic namespace string (great for per-user / per-guild data)

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

## Output modes

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
- **Not cross-workflow:** variables are scoped to the workflow they belong to, not shared globally across all workflows

For high-volume or high-concurrency state, consider using a database node (Redis, Postgres, MongoDB) instead.

Future versions of this node may add built-in Redis, Postgres, or n8n Data Tables backends.

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
