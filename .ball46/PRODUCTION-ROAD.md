# Ball46 canonical production road

This branch is the only source branch authorized for Ball46 wrapper/UI deployments.

- Canonical branch: `production/ball46-canonical`
- Initial verified source baseline: `64a3e64f57c8a6da2fdf4f56fa7cadeb97dbdd28`
- Deployment workflow: `Ball46 Production Road`
- Trigger: manual dispatch only
- Production source tag after success: `ball46-production-source`
- Protected services: ENGINE, HUB and FULL_MARKET
- Automatic rollback: previous active wrapper version when post-deploy checks fail

Do not deploy Ball46 from feature, rescue, backup or main branches.
