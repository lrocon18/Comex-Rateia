/// <reference types="vite/client" />

declare module '*.xlsx?url' {
  const src: string;
  export default src;
}
