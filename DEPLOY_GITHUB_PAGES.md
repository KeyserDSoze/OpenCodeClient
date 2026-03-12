# Deploy GitHub Pages

## Automatic deploy via GitHub Actions

Il repository include gia il workflow `/.github/workflows/deploy-pages.yml`.

### Cosa fare su GitHub

1. crea il repository e pusha il branch `main`
2. vai in `Settings -> Pages`
3. come source seleziona `GitHub Actions`
4. ogni push su `main` fara build e deploy automatico

## Manual deploy

Se preferisci il branch `gh-pages`, e gia pronto anche lo script:

```bash
npm run deploy
```

Lo script esegue prima la build e poi pubblica `dist`.

## Custom domain

Quando avrai acquistato il dominio:

1. crea `public/CNAME`
2. inserisci una sola riga con il dominio finale, per esempio:

```text
app.tuodominio.it
```

3. configura nel DNS del provider il record richiesto da GitHub Pages
4. abilita HTTPS da `Settings -> Pages`

### Configurazione attuale

Il progetto ora e gia configurato con:

```text
opencode.zone
```

nel file `public/CNAME`.

### DNS suggerito per `opencode.zone`

Per il dominio apex `opencode.zone`, su GitHub Pages in genere configuri:

```text
A     @     185.199.108.153
A     @     185.199.109.153
A     @     185.199.110.153
A     @     185.199.111.153
```

Opzionale ma consigliato anche il redirect da `www`:

```text
CNAME www   <username>.github.io
```

Poi in GitHub:

1. vai in `Settings -> Pages`
2. inserisci `opencode.zone` come custom domain
3. aspetta la verifica DNS
4. abilita `Enforce HTTPS`

## Server OpenCode

Ricordati poi di aggiungere l'origine GitHub Pages o il dominio finale al CORS del server, per esempio:

```bash
opencode serve --cors https://username.github.io --cors https://opencode.zone
```
