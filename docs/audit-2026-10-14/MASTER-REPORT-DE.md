# GrowCast — Review 14. Oktober 2026

Stand: Branch `cursor/daily-ai-grow-summary-ab77`, Commit `4b8caee`.

Methode: parallele, nur lesende Durchgänge (Auth, Medien/Mesh, KI-Zusammenfassung, Klima/Energie, Broadcast, Setup/Deploy, öffentliche API, Dashboard-UI). Jede als Critical oder High gemeldete Stelle wurde danach im aktuellen Code nachgelesen. Ohne diese zweite Bestätigung steht sie nicht als High im Bericht. Der 1.024-Agenten-Workflow war in dieser Cursor-Sitzung nicht startbar; die Abdeckung ist deshalb kein Anspruch auf jede der 402 Quelldateien.

Produktionsannahme: Docker Compose, Bind `127.0.0.1:3000`, Cloudflare Tunnel, `GROWCAST_TRUST_PROXY=1`.

## Kurzfassung

Die öffentlichen Schreibwege sind geschlossen: Admin-Aktionen prüfen die Session, Mesh verlangt ein Bearer-Token und fällt zu, wenn keins gesetzt ist, Archiv-IDs und Mediendateinamen werden geprüft. `DEFAULT_GROW` ist weg. Ein fehlendes Grow wird leer angelegt, kaputtes JSON wird nicht mehr durch eine Demo-Pflanze ersetzt.

Ein bestätigtes High bleibt: die Container `ggs` und `timelapse` mounten dasselbe `./data` wie die App und laufen als uid 1001, also als derselbe User, auf den die App nach dem Start fällt. Damit liegen Passwort-Hash, Session-Secret und Mesh-Token im Sidecar.

Daneben: ein kaputter Klimatag wird beim nächsten Ingest überschrieben, fehlende CO₂-/PPFD-Werte können die ganze bezahlte KI-Antwort verwerfen, die öffentliche Energie-URL schaltet mit Admin-Cookie auf den privaten Tarif, und das Dashboard zeigt bei einem Platzhalter-Saatdatum trotzdem ein Alter von tausenden Tagen.

**Health Score: 66 / 100.** Auth, Mesh und die öffentlichen Mutationsrouten sind in gutem Zustand. Der eine High-Befund sitzt an der Container-Grenze, und mehrere Medium-Befunde betreffen Datenverlust und falsche Zahlen, nicht einen offenen Admin-Zugang.

## Bestätigtes High

### H-01 — Sidecars lesen das Admin-Verzeichnis

| Feld | Inhalt |
|---|---|
| Severity | High |
| Ort | `docker-compose.yml` 29–39 und 61–72; `docker-entrypoint.sh` 23–30; `Dockerfile` 25–26 |
| Beschreibung | `ggs` und `timelapse` binden `./data` nach `/data` und laufen als `user: "1001:1001"`. Das App-Image legt `growcast` mit uid 1001 an. Der Entrypoint macht `chown -R growcast:growcast /app/data` und startet danach per `su-exec` als dieser User. `data/setup/admin.json` enthält Passwort-Hash und Session-Secret. `data/mesh.token` liegt im selben Baum. |
| Risiko | Ein Prozess in diesen beiden Containern kann die Admin-Credentials und das Mesh-Token lesen und die Setup-Marke `data/setup/complete` entfernen. Restream ist enger gefasst und mountet nur `./data/restream`. |
| Fix | Nur Sidecar-Env, Mesh-Token und die Medienpfade mounten, die der Worker wirklich schreibt. `data/setup` nur im App-Container lassen. |
| Aufwand | M |

## Als High gemeldet, nach dem zweiten Lesen heruntergestuft

Diese Stellen sind echt, aber kein High.

- **Login-Limit folgt dem weitergeleiteten Client-Header.** `lib/request-trust.ts` 44–85 liest bei `GROWCAST_TRUST_PROXY` zuerst `CF-Connecting-IP`, dann `X-Real-IP`, dann den ersten `X-Forwarded-For`-Hop. Compose setzt das Flag immer (`docker-compose.yml` 18). `proxy.ts` entfernt diese Header nicht. Auf dem dokumentierten Loopback-Bind erreicht das öffentliche Internet den Prozess nur über den Tunnel. Ein Container im Compose-Netz (`http://growcast:3000`) oder ein Bind auf `0.0.0.0` kann das Limit umgehen. Das ist Medium, kein öffentlicher Auth-Bypass auf dem Standardpfad. Aufwand S.
- **CO₂-Untergrenze 200 verwirft die ganze Antwort.** `lib/ai-summary/schema.ts` 101–122. Fehlende Sensoren sind `null` und werden nicht bewertet. Das Schema verlangt trotzdem eine Spanne, und `min: 0` für CO₂ ist ungültig. Dann fällt Temperatur, Feuchte und VPD mit. Medium, Aufwand M. PPFD darf bei 0 beginnen, CO₂ nicht.
- **Mosaik nur per Zeiger.** `components/ai-summary-card.tsx`. Status und Tageswert sitzen in `title` und einem Hover. Das entspricht dem festgelegten Layout, ist für Tastatur und Touch aber unsichtbar. Medium, Aufwand M.
- **Klimazahlen im Picker sind `aria-hidden`.** `components/climate-picker.tsx` 67–71. Der sichtbare Wert steht im Rad, das für assistive Technik ausgeblendet ist. Medium, Aufwand S.
- **Keine Error-Boundary.** Unter `app/` gibt es kein `error.tsx` und kein `global-error.tsx`. Medium, Aufwand S.
- **`pushState` im Workspace-Wechsel** wurde nicht unabhängig bestätigt und steht nicht als Befund.

## Bestätigte Medium

### M-01 — Kaputter Klimatag wird leer überschrieben

| Feld | Inhalt |
|---|---|
| Severity | Medium |
| Ort | `lib/climate/store.ts` 139–147; `lib/climate/writer.ts` 89–94 |
| Beschreibung | `readClimateDay` liefert bei korruptem JSON `null`. `recordClimateOnIngest` behandelt das als leeren Tag und schreibt den neuen Punkt zurück. Energie verweigert das Anhängen an einen korrupten Tag. |
| Risiko | Ein beschädigter Tag, oder ein Parse, der Punkte verwirft, wird beim nächsten guten Sample ersetzt. Der Mesh-POST bleibt 204, auch wenn das Schreiben schluckt. |
| Fix | Status `corrupt` nicht überschreiben. Den Ingest dann fehlschlagen lassen oder den Tag unangetastet lassen. |
| Aufwand | S |

### M-02 — Authenticator-Mismatch gibt trotzdem eine Session

| Feld | Inhalt |
|---|---|
| Severity | Medium |
| Ort | `lib/admin-auth.ts` 641–682; `lib/admin-totp.ts` 366–368 |
| Beschreibung | `corrupt` blockiert den Login. `mismatch` wird nur geloggt. Danach läuft `issueAdminSession`. Mismatch heißt: `totp.json` existiert, der Account-Tag passt aber nicht zu Benutzername plus Passwort-Hash. |
| Risiko | Nach einem Wechsel von `ADMIN_USERNAME` oder `ADMIN_PASSWORD_HASH` bei liegenbleibender `totp.json` ist der zweite Faktor aus. Das richtige Passwort reicht für 24 Stunden Admin. |
| Fix | Mismatch wie `corrupt` behandeln: keine Session, bis der Operator die Datei entfernt oder neu einschreibt. |
| Aufwand | S |

### M-03 — Öffentliche Energie-URL nutzt den privaten Tarif mit Admin-Cookie

| Feld | Inhalt |
|---|---|
| Severity | Medium |
| Ort | `app/api/data/energy/route.ts` 9–12 |
| Beschreibung | Anonyme Aufrufe bekommen `public`. Dieselbe URL schaltet auf `private`, sobald die Admin-Session gültig ist. Overlay und Dashboard pollen mit `credentials: "same-origin"`. |
| Risiko | Ein eingeloggter Browser auf der öffentlichen Seite oder im Overlay zeigt den privaten €/kWh-Satz. Ohne Cookie nicht. |
| Fix | Den privaten Satz nur auf einer Admin-Antwort liefern. Overlay und öffentliche Polls fest auf `public` stellen. |
| Aufwand | S |

### M-04 — Energie-Cursor und Tagesdateien sind zwei Schreibvorgänge

| Feld | Inhalt |
|---|---|
| Severity | Medium |
| Ort | `lib/energy/accrue.ts` 262–304 |
| Beschreibung | Zuerst werden die Tagesdateien geschrieben, danach der Cursor. Schlägt der Cursor-Schreibvorgang fehl, werden die Tagesdateien zurückgerollt. Ein Absturz zwischen den beiden Writes rollt nicht zurück. |
| Risiko | Der nächste Lauf addiert dasselbe Intervall noch einmal. kWh und Euro auf `/api/data/energy` bleiben zu hoch. |
| Fix | Cursor und Tagesdateien so schreiben, dass ein wiederholtes Intervall nicht doppelt zählt. |
| Aufwand | M |

### M-05 — Abgelehnte xAI-Antwort verbraucht einen Tagesplatz

| Feld | Inhalt |
|---|---|
| Severity | Medium |
| Ort | `lib/ai-summary/generate.ts` 67–78; `lib/ai-summary/usage.ts` 112–119 |
| Beschreibung | `reserveAiApiCall` zählt vor `fetch`. Cap ist 5 pro Berliner Tag. Schlägt HTTP, Timeout oder das Range-Parsing fehl, gibt es kein Zurückzählen. |
| Risiko | Eine CO₂-Spanne unter 200 (M, heruntergestuftes High) verbrennt einen der fünf Aufrufe, und der Scheduler kann es erneut versuchen. |
| Fix | Die Reservierung zurücknehmen, wenn der Call fehlschlägt oder der Body verworfen wird. Einen Parse-Fehler nicht erneut versuchen. |
| Aufwand | S |

### M-06 — Platzhalter-Saatdatum treibt das Alter

| Feld | Inhalt |
|---|---|
| Severity | Medium |
| Ort | `app/(site)/page.tsx` 150–154 und 177–179 |
| Beschreibung | Das Startdatum wird ausgelassen, wenn `formatDateDisplay` `01.01.2001` ergibt. Das Alter ruft trotzdem `getDaysSince(details.seededAt)`. |
| Risiko | Ein noch nicht gestarteter Grow zeigt tausende Tage, ohne das Datum, das die Zahl erklären würde. |
| Fix | Dieselbe Prüfung für Alter und Startdatum. Ohne brauchbares Datum kein Alter anzeigen. |
| Aufwand | S |

### M-07 — Secure-Cookie hängt am weitergeleiteten Proto

| Feld | Inhalt |
|---|---|
| Severity | Medium |
| Ort | `lib/request-trust.ts` 101–120 |
| Beschreibung | Ohne `COOKIE_SECURE` wird `Secure` gesetzt, wenn der erste `X-Forwarded-Proto` `https` ist oder `CF-Connecting-IP` wie eine IP aussieht. Compose setzt `COOKIE_SECURE` nicht. |
| Risiko | Ein Login ohne diese Header speichert das Admin-Cookie ohne `Secure`. |
| Fix | Auf dem Tunnel `COOKIE_SECURE=1` setzen. |
| Aufwand | S |

## Weitere Meldungen, nicht einzeln nachgelesen

Diese kamen aus den Lesedurchgängen und wirken konkret, wurden aber nicht Zeile für Zeile gegen den zweiten Leser geprüft. Vor einem Fix noch einmal öffnen.

- Galerie unter `public/setup` und `public/yourPictures` geht am sicheren Media-Route vorbei. Next liefert `public/` statisch und folgt Symlinks. Der Upload selbst kann den Link nicht anlegen. Medium, M.
- Capture-Token steht in der Kiosk-URL und damit in der Chromium-Befehlszeile (`extensions/GrowCast-Restream/restream.py`). Medium, M.
- Setup-Code geht beim Boot nach stdout und hat kein Versuchslimit, solange der Wizard offen ist. Medium, M.
- Compose-Image `0xmrcl/growcast:latest` ohne `pull_policy: build`. Medium, S.
- Kein `.github/workflows`. Medium, M.
- Veraltete Geräte und Watt im Overlay bleiben voll betont, wenn der Snapshot älter als 120 s ist. Medium, S.
- Ohne vertrauenswürdigen Proxy teilen sich SSE und Mesh-Fehler ein Bucket `unknown`. Medium, M.
- `GET /api/data/ai-summary` lässt `demo` weg. Mit `AI_SUMMARY_DEMO` und ohne gespeicherte Zusammenfassung sieht die Mock-Bewertung wie der echte Tag aus. Die Seite selbst zeigt „Demo“. Low, S.
- `assertPublicSafe` wird auf dem öffentlichen KI-Pfad nicht aufgerufen. Low, S.
- Erster Authenticator-Enrolment verlangt nicht noch einmal das Passwort. Medium, S.
- EventSub kann dieselbe Alert-ID innerhalb von zehn Minuten erneut anzeigen. Low, S.

## Was geprüft und nicht beanstandet wurde

- Mesh ohne Token ist zu. Plugin-IDs sind eine Allowlist.
- Archiv-IDs und Mediendateinamen werden geprüft. Admin-Medien-POST prüft Same-Origin und Session.
- Öffentliche JSON-Antworten enthalten keine Geräte-Serien und keinen Stream-Key. Der private Tarif-Schlüssel steht nicht im anonymen Energie-JSON.
- Grower-Zielwerte (`temperatureDay` und Verwandte) im User-Prompt brechen die KI-Generierung ab, bevor ein Call reserviert wird.
- Lights-off-PPFD (`isDay === false`) wird nicht bewertet. `null` für CO₂ und PPFD bleibt eine leere Zelle. Eine gespeicherte `0` ist ein echter Messwert.
- Der öffentliche GET der KI-Zusammenfassung enthält keinen API-Key und keinen Prompt.
- Das Widget bleibt aus, wenn weder `XAI_API_KEY` noch `AI_SUMMARY_DEMO` gesetzt ist.

## Roadmap

1. H-01: `./data` aus `ggs` und `timelapse` herausnehmen, nur die Pfade mounten, die sie schreiben. (M)
2. M-01: korrupte Klimatage nicht überschreiben. (S)
3. M-02: Authenticator-Mismatch fail-closed. (S)
4. M-03: öffentlichen Energie-Poll fest auf den öffentlichen Tarif. (S)
5. M-05 und die CO₂-Untergrenze: fehlende Metrik ohne Spanne erlauben, verworfene Calls nicht zählen. (M)
6. M-04: Energie-Intervall idempotent machen. (M)
7. M-06 und M-07: Alter nur bei echtem Saatdatum, `COOKIE_SECURE=1` im Tunnel. (S)
8. Klimazahl aus `aria-hidden` holen. Mosaik für Tastatur lesbar machen, wenn das Layout das zulässt. (S/M)

## Architektur

Die Grenze zwischen öffentlicher Seite und Admin ist im Request-Pfad klar: Cookie plus In-Memory-Session, Mesh separat mit Bearer. Die schwache Stelle ist das Dateisystem. App, GGS und Timelapse teilen sich einen User und einen Datenbaum. Klima und Energie schreiben JSON ohne eine gemeinsame Transaktion. Die KI-Schicht rechnet Prozent und Verdict lokal aus der Mosaic; die Range kommt weiter vom Modell und kann den ganzen Tag verwerfen, auch wenn CO₂ nie gemessen wurde.

Sinnvoller nächster Schnitt: Credentials und Mesh-Token nur im App-Volume, Sidecar-Mounts auf Env und Medien, und für Klima dieselbe „corrupt nicht überschreiben“-Regel wie bei Energie.

## Abdeckung

Inventar: 402 Dateien unter `app`, `components`, `lib`, `hooks`, `tests`, `extensions` sowie die Shell-Configs (`*.ts`, `*.tsx`, `*.mjs`, `*.py`, `*.sh`, `*.css`). Ausgeschlossen: `node_modules`, `.next`, `.git`.

Geöffnet wurden die Hochrisiko-Pfade: Admin-Auth und TOTP, `proxy.ts`, `request-trust`, Medien und Archive, Mesh, `lib/ai-summary`, Klima-Writer und -Store, Energie-Accrue und der öffentliche Energie-Route, Compose und Entrypoint, die Dashboard-Seite, der Climate-Picker. Tests, Python-Sidecars und ein Teil der Overlay-Komponenten wurden in den Lesedurchgängen geöffnet, hier aber nicht alle nachzitiert. Ein Claim auf 100 Prozent jeder Datei wäre falsch.
