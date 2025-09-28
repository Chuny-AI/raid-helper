---
applyTo: '**'
---
Provide project context and coding guidelines that AI should follow when generating code, answering questions, or reviewing changes.

# Copilot Instructions

Este repositorio es un **bot de Discord** desarrollado en **Node.js** usando la librería **discord.js**.  
El proyecto se desarrolla únicamente en **JavaScript** (no TypeScript).

---

## 📌 Variables de entorno
- Todas las variables se encuentran en el archivo `.env`.  
- Node.js ya maneja el acceso a estas variables a través de `--env-file=.env`.  

- ⚠️ **El proyecto NO utiliza `dotenv`. Todas las variables de entorno se cargan usando `--env-file=.env` de Node.js nativo.**

---

## 📌 Estilo del proyecto
- Usar CommonJS (`require/module.exports`).  
- Mantener el código **claro y modular** (separar comandos, eventos y utilidades en carpetas distintas).  
- Priorizar **async/await** sobre `.then()`.  
- Manejo de errores con `try/catch` y logs claros.  
- Evitar `console.log` para producción → usar un sistema de logging si se requiere.  

---

## 📌 Discord.js
- Las interacciones deben estar centradas en **slash commands** y eventos.  
- Validar siempre los permisos de usuario y del bot antes de ejecutar comandos.  
- Respuestas al usuario deben ser **claras, amigables y rápidas** (buena UX).  
- Evitar spam de mensajes, preferir **embeds** y componentes interactivos cuando sea apropiado.  

---

## 📌 Buenas prácticas
- Seguir principios de **UX**: feedback inmediato, mensajes comprensibles, consistencia en el diseño de respuestas.  
- Mantener un estilo consistente en nombres de variables y funciones (camelCase).  
- Evitar dependencias innecesarias.
