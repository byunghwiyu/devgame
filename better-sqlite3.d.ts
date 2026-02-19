declare module "better-sqlite3" {
  type Params = unknown[];

  export type Statement = {
    run: (...params: Params) => unknown;
    get: (...params: Params) => unknown;
    all: (...params: Params) => unknown[];
  };

  export interface Database {
    exec(sql: string): void;
    pragma(sql: string): void;
    prepare(sql: string): Statement;
    transaction<TArgs extends unknown[], TResult>(fn: (...args: TArgs) => TResult): (...args: TArgs) => TResult;
  }

  const DatabaseCtor: {
    new (filename: string): Database;
  };

  export default DatabaseCtor;
}
