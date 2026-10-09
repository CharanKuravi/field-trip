import Papa from 'papaparse';
import { gridToRows } from './logic.js';
import { HttpError } from './http.js';

/** .xlsx or .csv -> array of row objects keyed by normalised header. */
export async function readTable(filename, buf) {
  let grid;
  try {
    if (/\.xlsx$/i.test(filename)) { const { default: readXlsxFile } = await import('read-excel-file/node'); grid = await readXlsxFile(buf); }
    else if (/\.xls$/i.test(filename)) throw new Error('legacy xls');
    else grid = Papa.parse(buf.toString('utf8').replace(/^\uFEFF/, ''), { skipEmptyLines: true }).data;
  } catch { throw new HttpError(400, 'Could not read this file. Use .xlsx (not .xls) or UTF-8 .csv'); }
  return gridToRows(grid);
}
