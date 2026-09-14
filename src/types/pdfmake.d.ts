// pdfmake ships no types; this covers the little the app uses (see utils/pdf-export).
declare module 'pdfmake/build/pdfmake' {
  interface OutputDocument {
    download(fileName?: string): Promise<void>
    getBlob(): Promise<Blob>
  }
  interface PdfMake {
    addVirtualFileSystem(vfs: Record<string, string>): void
    createPdf(definition: Record<string, unknown>): OutputDocument
  }
  const pdfMake: PdfMake
  export default pdfMake
}

declare module 'pdfmake/build/vfs_fonts' {
  const vfs: Record<string, string>
  export default vfs
}
