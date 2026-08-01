import { describe, it, expect } from 'vitest';
import { createForm, type SchemaIssue, type BaseSchema } from './form.svelte';

// A minimal object schema that implements the `@standard-schema/spec` interface.
// We sketch it ourselves (no external validator) to prove the library only
// depends on the standard interface.

// helper type for a generic standard-schema object with an `entries` map
interface ObjectSchema<Input, Output> extends BaseSchema<Input, Output> {
	entries: Record<string, BaseSchema>;
}

// helper to construct a primitive schema
function primitiveSchema<T>(
	validate: (value: unknown) =>
		| { value: T }
		| { issues: SchemaIssue[] }
		| Promise<{ value: T } | { issues: SchemaIssue[] }>
): BaseSchema<T, T> {
	return {
		'~standard': {
			version: 1,
			vendor: 'test',
			types: { input: undefined as unknown as T, output: undefined as unknown as T },
			validate
		}
	} as unknown as BaseSchema<T, T>;
}

const schema: ObjectSchema<{ foo: string }, { foo: string }> = {
	'~standard': {
		version: 1,
		vendor: 'test',
		types: { input: { foo: '' }, output: { foo: '' } },
		validate: (v) => {
			if (typeof v === 'object' && v !== null && 'foo' in (v as Record<string, unknown>)) {
				return { value: v as unknown as { foo: string } };
			}
			return { issues: [{ message: 'invalid' }] };
		}
	},
	entries: {
		foo: primitiveSchema((v) =>
			typeof v === 'string' ? { value: v } : { issues: [{ message: 'not string' }] }
		)
	}
};

const asyncSchema: ObjectSchema<{ username: string }, { username: string }> = {
	'~standard': {
		version: 1,
		vendor: 'test',
		types: { input: { username: '' }, output: { username: '' } },
		validate: async (v) => {
			if (typeof v === 'object' && v !== null && 'username' in (v as Record<string, unknown>)) {
				return { value: v as unknown as { username: string } };
			}
			return { issues: [{ message: 'invalid' }] };
		}
	},
	entries: {
		username: primitiveSchema(async (v) => {
			if (typeof v !== 'string') {
				return { issues: [{ message: 'not string' }] };
			}

			await Promise.resolve();

			if (v.toLowerCase() === 'taken') {
				return { issues: [{ message: 'username already taken' }] };
			}

			return { value: v };
		})
	}
};

describe('createForm', () => {
	it('validates and produces output', async () => {
		const form = createForm(schema, { foo: 'bar' });
		const [input, output, error] = await form.validate();
		expect(error).toBeUndefined();
		expect(output).toEqual({ foo: 'bar' });
	});

	it('reports issues when value invalid', async () => {
		const form = createForm(schema, { foo: 123 } as unknown as { foo: string });
		const [input, output, error] = await form.validate();
		expect(output).toBeUndefined();
		expect(error?.issues[0].message).toBe('not string');
	});

	it('awaits async schema validation', async () => {
		const form = createForm(asyncSchema, { username: 'new-user' });
		const [_input, output, error] = await form.validate();

		expect(error).toBeUndefined();
		expect(output).toEqual({ username: 'new-user' });
	});

	it('reports async validation issues', async () => {
		const form = createForm(asyncSchema, { username: 'taken' });
		const [_input, output, error] = await form.validate();

		expect(output).toBeUndefined();
		expect(error?.issues[0].message).toBe('username already taken');
	});
});
