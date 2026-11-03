# Legacy Migration with Contract Tests

Gradual migration of a legacy PHP 5.6 / CodeIgniter 3 billing service to a NestJS service, without stopping the business: one black-box contract suite runs against both, a router Lambda shifts traffic through `legacy`, `shadow`, `percentage` and `new` modes, and a comparator proves zero divergences before each step.

> Work in progress.

## Getting started

```bash
pnpm install
cp .env.example .env
pnpm infra:up
pnpm test:contract:legacy
```
