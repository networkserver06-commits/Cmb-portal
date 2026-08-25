# Production routing findings

- `https://portal.leetec.online/` serves the ExamVault homepage successfully.
- `https://portal.leetec.online/account` returns a Vercel `404: NOT_FOUND` page before the React application loads.
- The custom domain is serving the expected project at `/`, so the failure is specific to direct route handling rather than the domain pointing to an unrelated deployment.
- The repository already contains SPA rewrites for `/account`, `/login`, `/signup`, `/create-account`, `/reset-password`, and `/verify-email`; the production 404 indicates the deployed configuration is either stale, not associated with this Vercel project, or not being applied by the current deployment target.
- The fix must therefore include a fresh redeploy of the corrected checkpoint and confirmation that the Vercel project root is the repository root containing `vercel.json`.
