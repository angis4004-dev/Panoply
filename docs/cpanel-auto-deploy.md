# Automatic cPanel Deployment

The `Deploy to cPanel` workflow builds the Next.js standalone package on GitHub Actions, then uploads it to cPanel over SSH. cPanel does not need to run `npm install` or `next build`.

## cPanel setup

Create a Node.js application in **Setup Node.js App**:

- Node.js: 22
- Environment: Production
- Application root: an absolute path such as `/home/CPANEL_USER/panoply-app`
- Startup file: `server.js`

Add the application's runtime environment variables in cPanel. Do not put secrets in GitHub or the repository.

## GitHub repository secrets

Add these secrets under **Settings > Secrets and variables > Actions**:

- `CPANEL_HOST`: cPanel server hostname
- `CPANEL_USER`: cPanel SSH username
- `CPANEL_SSH_KEY`: private SSH key authorized in cPanel
- `CPANEL_APP_PATH`: absolute application root, such as `/home/CPANEL_USER/panoply-app`
- `CPANEL_SSH_PORT`: optional SSH port; omit it when the server uses port 22

The key must be the private key. Never commit it to the repository. The matching public key must be authorized in cPanel under **SSH Access**.

## Deployment behavior

Every push to `main` runs CI first. After CI passes, the deployment workflow builds the standalone app and uploads it to cPanel. You can also run it manually from the **Actions** tab with **Run workflow**.

The workflow restarts the cPanel Node.js application by touching `tmp/restart.txt`. If your host uses a different restart mechanism, replace that command with the mechanism documented by the host.
