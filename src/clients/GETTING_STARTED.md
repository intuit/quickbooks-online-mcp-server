## Setup

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file in the root directory with the following variables:
```env
QUICKBOOKS_CLIENT_ID=your_client_id
QUICKBOOKS_CLIENT_SECRET=your_client_secret
QUICKBOOKS_ENVIRONMENT=production # or sandbox

# Optional: restrict which tool categories are registered (default: all enabled)
# QUICKBOOKS_DISABLE_WRITE=true    # suppress create_* tools
# QUICKBOOKS_DISABLE_UPDATE=true   # suppress update_* tools
# QUICKBOOKS_DISABLE_DELETE=true   # suppress delete_* tools
```

3. Get your Client ID and Client Secret:
   - Go to the [Intuit Developer Portal](https://developer.intuit.com/)
   - Create a new app or select an existing one
   - Get the Client ID and Client Secret from the app's keys section
   - Add `http://localhost:8000/callback` to the app's Redirect URIs