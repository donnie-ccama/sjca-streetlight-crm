import { createSchema, createYoga } from 'graphql-yoga';

describe('GraphQL mutation execution', () => {
  it.each([false, true])(
    'returns completed mutations in order (async: %s)',
    async (asynchronous) => {
      const completed: string[] = [];
      const yoga = createYoga({
        logging: false,
        schema: createSchema({
          typeDefs: `
            type Query { ready: Boolean! }
            type Mutation { record(value: String!): String! }
          `,
          resolvers: {
            Mutation: {
              record: (_source: unknown, { value }: { value: string }) => {
                const complete = () => {
                  completed.push(value);

                  return value;
                };

                return asynchronous
                  ? Promise.resolve().then(complete)
                  : complete();
              },
            },
          },
        }),
      });

      const response = await yoga.fetch('http://localhost/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `mutation {
            first: record(value: "first")
            second: record(value: "second")
          }`,
        }),
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        data: { first: 'first', second: 'second' },
      });
      expect(completed).toEqual(['first', 'second']);
    },
  );
});
