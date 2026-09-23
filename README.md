# Tenis Plus — edición para GitHub Pages (gratis)

Esta versión contiene una **web estática**, una tarea de GitHub Actions que consulta Live Tennis API FREE y un archivo JSON de calendario generado. **No requiere Node.js permanentemente encendido, ni Vercel, ni servidor de pago.** No está publicada todavía: tienes que subir el proyecto a tu repositorio y configurar el secreto.

## Publicarla paso a paso (primera vez)

1. Crea tu clave personal gratuita en https://livetennisapi.com/subscribe/free. No la compartas, no la escribas en chats, archivos HTML, commits ni capturas.
2. Crea un repositorio **público** en tu cuenta de GitHub, por ejemplo `tenis-plus`, con rama `main`. En el plan gratuito, comprueba que GitHub Pages esté disponible en el repositorio elegido.
3. Sube a la **raíz del repositorio** todos los archivos y carpetas de este ZIP, incluidos `.github/workflows/pages.yml`, `scripts/`, `data/`, `index.html`, `app.js`, `styles.css`, `favicon.svg` y `free-provider.js`. NO subas la carpeta `dist/` (se genera sola), claves ni archivos `.env`.
4. En el repositorio abre **Settings → Secrets and variables → Actions → New repository secret**. Nombre EXACTO: `LIVETENNISAPI_KEY`. Valor: tu clave real. Guardar. El nombre de la variable importa. No uses una variable pública ni la incluyas en `data/calendar.json`.
5. En **Settings → Pages → Build and deployment → Source**, elige **GitHub Actions**, no «Deploy from a branch».
6. Ve a **Actions → Tenis Plus - cartelera y GitHub Pages → Run workflow → Branch main → Run workflow**. Espera a que ambos jobs (`build` y `deploy`) tengan marca verde. La primera publicación tras subir el código puede mostrar la agenda vacía hasta esta ejecución manual.
7. Abre la URL indicada en **Settings → Pages** o en el resultado del job `deploy`. Para un repositorio de proyecto, suele ser `https://TUUSUARIO.github.io/tenis-plus/`. Si el nombre del repositorio es distinto, cambia la última parte. **No hay URL pública asignada antes de publicarla.**

Si falla el paso de confirmar cambios en `data/calendar.json` por permisos, revisa **Settings → Actions → General → Workflow permissions** y las reglas de protección de `main`; el workflow solicita `contents: write`, `pages: write` e `id-token: write`. Una regla que impida al bot actualizar `main` también puede impedir guardar los datos.

## Qué hace de manera automática

- GitHub Actions consulta `/matches?status=upcoming`, `/matches?status=live`, `/fixtures` y hasta ocho fichas de torneo por ejecución cuando tengan identificador. Recopila ATP, WTA, Challenger, ITF, juniors, dobles y otras competiciones **si el proveedor las publica**; no promete 100 % de cobertura. Marca dobles «NO APOSTAR» automáticamente porque el checklist se diseñó para individuales.
- El archivo `data/calendar.json` contiene únicamente datos de partidos y avisos de cobertura; **no** contiene API keys, evaluaciones, nombres de casas seleccionadas ni apuestas. Un cambio de día o filtro solo lee el archivo, sin gastar consultas de la API. Las horas con zona verificada se convierten a `America/Monterrey`; si falta la hora, aparece «Por definir».
- Programación: **tres ejecuciones al día**, aproximadamente 00:23, 08:23 y 16:23 de Monterrey (06:23, 14:23 y 22:23 UTC). También puede dispararse manualmente en Actions. Por ejecución, el código limita a 8 páginas de próximos, 2 de en vivo, 8 de agenda y 8 fichas de torneo: **hasta 26 llamadas**. Tres ejecuciones completas supondrían hasta 78, dentro de las 100/día del plan FREE; **las ejecuciones manuales consumen cuota adicional** y otros usos de la misma clave también. El proveedor aplica el límite efectivo.
- En cada ejecución con clave y datos válidos, el job actualiza `data/calendar.json` en la rama `main`, construye `dist/` y publica el sitio con `actions/upload-pages-artifact` y `actions/deploy-pages`. Los commits automáticos hechos con `GITHUB_TOKEN` no necesitan desencadenar otro despliegue: el propio job actual publica el sitio.
- Si falta la clave o la API falla sin devolver registros, se conserva el JSON previo y la web puede señalar datos antiguos. Si la respuesta es parcial, se publica el aviso y **no se autoriza una candidatura**. No se insertan torneos ficticios o una muestra de septiembre de 2026.
- La pantalla comprueba periódicamente si se ha actualizado el JSON publicado (a lo sumo cada 30 minutos con la página abierta); pulsar ↻ vuelve a descargar **el archivo ya publicado**, no fuerza una nueva consulta a la API. Los cron pueden retrasarse, omitirse bajo carga o desactivarse después de 60 días sin actividad en un repositorio público; revisa Actions si la página queda antigua.

## Análisis y registro de apuestas

Mantiene los 29 indicadores del documento y la decisión nº 30. Cuota mínima de 1.20, estimación propia documentada, valor esperado positivo y controles revisados: **no hay apuestas seguras**. La API gratuita **no facilita cuotas vigentes, H2H completo ni probabilidades predictivas**: deben documentarse por separado. La app tampoco incorpora un modelo de IA que rellene automáticamente los 30 criterios.

Las apuestas que confirmes haber hecho, las evaluaciones y la banca se guardan **únicamente en el `localStorage` del navegador**. Un enlace público no crea cuentas privadas ni sincroniza historial entre el celular y la computadora. Ve a «Fuentes y datos → Exportar todo» para hacer copias y «Restaurar respaldo» para importarlas en otro navegador. Los resultados y liquidaciones se introducen manualmente y deben confirmarse con la casa. Esta web nunca realiza apuestas.

**Privacidad:** si el repositorio es público, los archivos y el calendario generado son públicos. No subas respaldos de apuestas a ese repositorio. Tu API key debe existir solo como GitHub Actions Secret. El workflow publica exclusivamente los archivos HTML/CSS/JS, SVG y el JSON saneado dentro de `dist/`.

## Estructura del proyecto

```text
index.html                  Interfaz GitHub Pages
app.js / styles.css         Análisis e historial local
favicon.svg / .nojekyll     Recursos estáticos
free-provider.js            Normalización, paginación y consulta de API (Actions, NO publicado)
data/calendar.json          Datos de jornadas; inicialmente sin partidos
scripts/update-calendar.js  Actualización privada con el Secret
scripts/build-site.js       Prepara carpeta dist/ sin claves
scripts/test-pages.js       Pruebas sin clave real ni consumo de cuota
.github/workflows/pages.yml Programación, guardado y despliegue
```

Para verificar el proyecto en una máquina con **Node.js 18+**:

```bash
node scripts/test-pages.js
node scripts/build-site.js
```

Para previsualizar `dist/` localmente, sirve esa carpeta con un servidor HTTP estático, por ejemplo `python -m http.server 8000 --directory dist` y abre `http://localhost:8000`. Abrir `index.html` desde `file://` puede bloquear la lectura del JSON. **No ejecutes el actualizador sin tu clave real**, salvo bajo pruebas simuladas.

Documentación: https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages · https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows · https://docs.livetennisapi.com/reference.html
