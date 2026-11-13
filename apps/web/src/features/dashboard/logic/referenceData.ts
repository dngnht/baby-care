/**
 * Build-time wiring of the care reference table.
 *
 * Vite inlines the knowledge markdown into the bundle (`?raw`), so the app
 * ships the real table — no medical number is duplicated in source. The parser
 * itself lives in `./reference` and is tested against this same file.
 */
import referenceMd from '../../../../../../knowledge/care/feeding_sleep_reference.md?raw'
import { parseReference, type ReferenceTable } from './reference'

/** The bundled table, parsed once at module load. */
export const FEEDING_SLEEP_REFERENCE: ReferenceTable = parseReference(referenceMd)
