// Wrapper do SheetJS carregado sob demanda (`await import('./sheetjs')`).
// A doc oficial recomenda reexportar só o que se usa: assim o bundler otimiza o
// chunk e a biblioteca (~600 KB) fica fora do carregamento inicial.
export { read, utils, writeFileXLSX } from 'xlsx';
