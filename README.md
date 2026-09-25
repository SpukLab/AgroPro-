# SURKARA

SURKARA es una plataforma operacional agropecuaria mobile-first orientada a conectar planificación, ejecución, evidencia, conciliación y resultado.

> El repositorio conserva temporalmente el nombre técnico heredado `SpukLab/AgroPro-`. SURKARA continúa como nombre de producto de trabajo hasta completar clearance marcario/denominativo y verificación de dominios antes de consolidar branding.

## Documentación

- [Project Context](docs/PROJECT-CONTEXT.md) — punto de entrada para retomar el proyecto, alcance, decisiones vigentes, primer vertical slice y relación futura con Forgeworks.
- [Domain Blueprint v0.3](docs/DOMAIN-BLUEPRINT-v0.3.md) — canon vigente de límites de dominio e invariantes.
- [Domain Stress Test v0.1](docs/DOMAIN-STRESS-TEST-v0.1.md) — validación de los 17 flujos obligatorios y gaps resueltos.
- [Domain Blueprint v0.2](docs/DOMAIN-BLUEPRINT-v0.2.md) — versión histórica previa al stress test.
- [Research Synthesis — 2026-09-24](docs/RESEARCH-SYNTHESIS-2026-09-24.md) — síntesis de investigaciones Claude/Gemini/Grok, riesgos, convergencias y cuestiones que todavía requieren evidencia de campo.

## Estado

El dominio v0.3 ya fue stress-testeado y el proyecto entra en derivación arquitectónica antes de continuar la expansión técnica. La implementación existente en `index.html` se conserva como prototipo funcional de referencia.

## Orden recomendado para continuar

1. Leer `docs/PROJECT-CONTEXT.md`.
2. Revisar `docs/DOMAIN-BLUEPRINT-v0.3.md`.
3. Consultar `docs/DOMAIN-STRESS-TEST-v0.1.md` para las invariantes que motivaron v0.3.
4. Derivar aggregate boundaries, contratos e invariantes de persistencia.
5. Definir estrategia offline/sync.
6. Elegir arquitectura técnica mínima y migrar el prototipo por vertical slice.
