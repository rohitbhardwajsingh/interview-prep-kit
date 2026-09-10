# Deploying to Render + MongoDB Atlas (free tier)

The app is two long-running Node services — an Express **API** (which keeps
generating a kit in the background after responding) and a Next.js **web**
frontend — plus **MongoDB**. Serverless hosts (Netlify/Vercel functions) cannot
run the background generation, so both services run as persistent Render Web
Services, with the database on MongoDB Atlas.

There is a deliberate order below, because each web service needs the other's
public URL.

## 1. Database — MongoDB Atlas

1. Create a free **M0** cluster at <https://www.mongodb.com/atlas>.
2. **Database Access** → add a user with a password.
3. **Network Access** → allow `0.0.0.0/0` (Render's IPs are dynamic on free tier).
4. **Connect → Drivers** → copy the SRV string, e.g.
   `mongodb+srv://USER:PASS@cluster0.xxxx.mongodb.net/?retryWrites=true&w=majority`
   Keep it for step 3.

## 2. LLM key

Get a free **Gemini** API key at <https://aistudio.google.com/apikey>. Keep it
for step 3. (Anthropic also works — set `LLM_PROVIDER=anthropic` and
`ANTHROPIC_API_KEY` instead.)

## 3. Deploy the blueprint

1. Push this repo to GitHub.
2. Render → **New → Blueprint** → pick the repo. It reads `render.yaml` and
   creates **prepkit-api** and **prepkit-web**.
3. When prompted, set the `sync:false` values:
   - **prepkit-api** → `MONGO_URL` (the Atlas string), `GEMINI_API_KEY`.
     Leave `WEB_ORIGIN` blank for now.
   - **prepkit-web** → leave `NEXT_PUBLIC_API_URL` blank for now.
4. Let **prepkit-api** finish deploying. Note its URL, e.g.
   `https://prepkit-api.onrender.com`.

## 4. Wire the two URLs together (the second pass)

1. **prepkit-web** → Environment → set
   `NEXT_PUBLIC_API_URL = https://prepkit-api.onrender.com` (no trailing slash)
   → **Manual Deploy** (this value is baked in at build time).
   Note the web URL, e.g. `https://prepkit-web.onrender.com`.
2. **prepkit-api** → Environment → set
   `WEB_ORIGIN = https://prepkit-web.onrender.com` (no trailing slash) → save
   (it redeploys). This is what CORS and the session cookie trust.

## 5. Verify

- `https://prepkit-api.onrender.com/health` → `{"ok":true}`
- Open the web URL, register, create a kit, watch it generate.

## Notes

- **Cross-site cookies:** in production the session cookie is `SameSite=None;
  Secure`, and the API sets `trust proxy`, so auth works across the two Render
  domains over HTTPS. `WEB_ORIGIN` must match the web URL exactly.
- **Free-tier cold starts:** free services sleep after ~15 min idle; the first
  request then takes ~50s. Fine for a demo; expect the first kit of a session to
  wait on a cold API.
- **The batch command is not deployed.** `npm run evaluate` is run from a clean
  clone locally, exactly as the brief specifies; deployment covers only the app.
