declare module 'open' {
  interface Options {
    app?: string | string[] | undefined;
    arguments?: string[] | undefined;
    wait?: boolean | undefined;
    background?: boolean | undefined;
    newInstance?: boolean | undefined;
  }

  interface OpenFunction {
    (target: string, options?: Options): Promise<any>;
    __promisify__(target: string, options?: Options): Promise<any>;
  }

  const open: OpenFunction;
  export = open;
} 