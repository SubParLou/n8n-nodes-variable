import type { ICredentialType, INodeProperties } from 'n8n-workflow';

export class N8nVariableNodeApi implements ICredentialType {
  name = 'n8nVariableNodeApi';

  displayName = 'n8n Variable Node API';

  documentationUrl = 'https://docs.n8n.io/api/authentication/';

  properties: INodeProperties[] = [
    {
      displayName: 'n8n Instance URL',
      name: 'baseUrl',
      type: 'string',
      default: 'http://localhost:5678',
      placeholder: 'https://your-n8n-instance.example.com',
      required: true,
      description: 'The base URL of your n8n instance (no trailing slash)',
    },
    {
      displayName: 'API Key',
      name: 'apiKey',
      type: 'string',
      typeOptions: { password: true },
      default: '',
      required: true,
      description: 'Your n8n API key. Generate one in Settings → API.',
    },
  ];
}
