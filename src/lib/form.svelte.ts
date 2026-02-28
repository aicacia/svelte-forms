import type { StandardSchemaV1 } from '@standard-schema/spec';
import { debounce } from '@aicacia/debounce';

// helper to invoke the standard-schema validate function which lives under the
// private "~standard" property according to the spec.  we define a minimal
// interface so we don't need to cast to `any` when accessing it.
interface WithValidate<Out> {
	'~standard': {
		validate: (
			value: unknown
		) => StandardSchemaV1.Result<Out> | Promise<StandardSchemaV1.Result<Out>>;
	};
}

function runValidate<S extends BaseSchema>(
	schema: S,
	value: unknown
): StandardSchemaV1.Result<InferOutput<S>> | Promise<StandardSchemaV1.Result<InferOutput<S>>> {
	return (schema as unknown as WithValidate<InferOutput<S>>)['~standard'].validate(value);
}

export type FieldState = 'validating' | 'valid' | 'invalid' | 'unset' | 'set';

// schema helpers
export type BaseSchema<Input = unknown, Output = Input> = StandardSchemaV1<Input, Output>;

export type ObjectSchemaType = BaseSchema & { entries: Record<string, BaseSchema> };
export type ArraySchemaType = BaseSchema & { item: BaseSchema };

export type InferInput<S extends BaseSchema> = StandardSchemaV1.InferInput<S>;
export type InferOutput<S extends BaseSchema> = StandardSchemaV1.InferOutput<S>;
export type SchemaIssue = StandardSchemaV1.Issue;
export type ValidationFailure = StandardSchemaV1.FailureResult;

export type ValidationOk<V extends BaseSchema> = [
	input: InferInput<V>,
	output: InferOutput<V>,
	error: undefined
];
export type ValidationErr<V extends BaseSchema> = [
	input: InferInput<V>,
	output: undefined,
	error: ValidationFailure
];
export type ValidationResult<V extends BaseSchema> = ValidationOk<V> | ValidationErr<V>;

export interface CommonField<V extends BaseSchema> {
	readonly issues: SchemaIssue[];
	readonly state: FieldState;
	reset(newInitialValue?: InferInput<V>): void;
	validate(): Promise<ValidationResult<V>>;
}

export interface PrimitiveField<V extends BaseSchema> extends CommonField<V> {
	get value(): InferOutput<V> | undefined;
	set value(newValue: InferInput<V> | undefined);
}

export interface ArrayField<V extends ArraySchemaType> extends CommonField<V> {
	readonly items: Field<V['item']>[];
}

export interface ObjectField<V extends ObjectSchemaType> extends CommonField<V> {
	readonly fields: { [K in keyof V['entries']]: Field<V['entries'][K]> };
}

export type Field<V extends BaseSchema> = V extends ArraySchemaType
	? ArrayField<V>
	: V extends ObjectSchemaType
		? ObjectField<V>
		: PrimitiveField<V>;

export interface Config {
	debounceMS?: number;
}

function createObjectField<V extends ObjectSchemaType>(
	schema: V,
	initialValue: InferInput<V> = {} as InferInput<V>,
	{ debounceMS = 300 }: Config
): ObjectField<V> {
	let state = $state<FieldState>('unset');
	const fields = $state({} as { [K in keyof V['entries']]: Field<V['entries'][K]> });
	const issues = $state<SchemaIssue[]>([]);

	// `initialValue` may be unknown at compile time, so treat it as a record to
	// perform indexed access without resorting to `any`.
	const iv = initialValue as unknown as Record<string, unknown>;
	for (const [fieldName, fieldSchema] of Object.entries(schema.entries) as [
		keyof V['entries'],
		V['entries'][keyof V['entries']]
	][]) {
		fields[fieldName] = createField(fieldSchema, iv[fieldName as string] as InferInput<V>, {
			debounceMS
		}) as Field<V['entries'][typeof fieldName]>;
	}

	async function validate(): Promise<ValidationResult<V>> {
		// partial objects while we accumulate values, then cast at the end
		const fieldInputs = {} as Partial<InferInput<V>>;
		const fieldOutputs = {} as Partial<InferOutput<V>>;
		const fieldIssues: SchemaIssue[] = [];

		state = 'validating';

		await Promise.all(
			Object.entries(fields).map(async ([key, field]) => {
				const fieldName = key as keyof V['entries'];
				const [fi, fo, fe] = await field.validate();
				fieldInputs[fieldName as keyof InferInput<V>] = fi;
				if (fe) {
					for (const issue of fe.issues) {
						const path = issue.path ? [...issue.path] : [];
						fieldIssues.push({
							...issue,
							path: [fieldName as unknown as PropertyKey, ...path]
						});
					}
				} else {
					fieldOutputs[fieldName as keyof InferOutput<V>] = fo;
				}
			})
		);

		if (fieldIssues.length > 0) {
			state = 'invalid';
			issues.length = 0;
			issues.push(...fieldIssues);
			return [fieldInputs, undefined, { issues: fieldIssues }];
		}

		const result = await runValidate(schema, fieldInputs as unknown);
		if ('issues' in result && result.issues) {
			state = 'invalid';
			issues.length = 0;
			issues.push(...(result.issues as SchemaIssue[]));
			return [fieldInputs, undefined, { issues: [...result.issues] }];
		}

		state = 'valid';
		issues.length = 0;
		const output = result.value as InferOutput<V>;
		return [fieldInputs, output, undefined];
	}

	function reset(newInitialValue?: InferInput<V>) {
		const iv = newInitialValue ?? initialValue;
		const ivRec = iv as unknown as Record<string, unknown>;
		const origRec = initialValue as unknown as Record<string, unknown>;
		for (const [fieldName, field] of Object.entries(fields)) {
			field.reset(
				(ivRec[fieldName as string] as InferInput<V>) ??
					(origRec[fieldName as string] as InferInput<V>)
			);
		}
		state = 'unset';
		issues.length = 0;
	}

	return {
		get fields() {
			return fields;
		},
		get state() {
			return state;
		},
		get issues() {
			return issues;
		},
		validate,
		reset
	};
}

function createArrayField<V extends ArraySchemaType>(
	schema: V,
	initialValue: InferInput<V> = [] as unknown as InferInput<V>,
	{ debounceMS = 300 }: Config
): ArrayField<V> {
	let state = $state<FieldState>('unset');
	const items = $state(
		(initialValue as unknown as unknown[]).map((itemValue: unknown) =>
			createField(schema.item, itemValue, { debounceMS })
		) as Field<V['item']>[]
	);
	const issues = $state<SchemaIssue[]>([]);

	async function validate(): Promise<ValidationResult<V>> {
		const itemsInput: unknown[] = [];
		const itemsOutput: unknown[] = [];
		const itemsIssues: SchemaIssue[] = [];

		state = 'validating';

		await Promise.all(
			items.map(async (itemField, index) => {
				const [ii, io, ie] = await itemField.validate();
				itemsInput[index] = ii;

				if (ie) {
					for (const issue of ie.issues) {
						const path = issue.path ? [...issue.path] : [];
						itemsIssues.push({
							...issue,
							path: [index as unknown as PropertyKey, ...path]
						});
					}
				} else {
					itemsOutput[index] = io;
				}
			})
		);

		if (itemsIssues.length > 0) {
			state = 'invalid';
			issues.length = 0;
			issues.push(...itemsIssues);
			return [itemsInput, undefined, { issues: itemsIssues }];
		}

		const result = await runValidate(schema, itemsInput as unknown);
		if ('issues' in result && result.issues) {
			state = 'invalid';
			issues.length = 0;
			issues.push(...(result.issues as SchemaIssue[]));
			return [itemsInput, undefined, { issues: [...result.issues] }];
		}

		state = 'valid';
		issues.length = 0;
		const output = result.value as InferOutput<V>;
		return [itemsInput, output, undefined];
	}

	function reset(newInitialValue?: InferInput<V>) {
		const initialValues = (newInitialValue ?? initialValue) as unknown[];
		items.length = initialValues.length;
		for (let i = 0; i < items.length; i++) {
			const field = items[i];
			if (field) {
				field.reset(initialValues[i] as InferInput<V>);
			} else {
				items[i] = createField(schema.item, initialValues[i], { debounceMS }) as Field<V['item']>;
			}
		}
		state = 'unset';
		issues.length = 0;
	}

	return {
		get items() {
			return items;
		},
		get state() {
			return state;
		},
		get issues() {
			return issues;
		},
		validate,
		reset
	};
}

function createPrimitiveField<V extends BaseSchema>(
	schema: V,
	initialValue: InferInput<V> = undefined as unknown as InferInput<V>,
	debounceMS = 300
): PrimitiveField<V> {
	let state = $state<FieldState>('unset');
	let input = $state<InferInput<V>>(initialValue as unknown as InferInput<V>);
	let output = $state<InferOutput<V>>(initialValue as unknown as InferOutput<V>);
	const issues = $state<SchemaIssue[]>([]);

	async function validate(): Promise<ValidationResult<V>> {
		try {
			state = 'validating';
			const result = await runValidate(schema, input as unknown);
			if ('issues' in result && result.issues) {
				state = 'invalid';
				output = input as InferOutput<V>;
				issues.length = 0;
				issues.push(...(result.issues as SchemaIssue[]));
				return [input, undefined, { issues: [...result.issues] }];
			} else {
				output = result.value as InferOutput<V>;
				state = 'valid';
				issues.length = 0;
				return [input, output, undefined];
			}
		} catch (e) {
			state = 'invalid';
			output = input as InferOutput<V>;
			issues.length = 0;
			if (e && typeof e === 'object' && 'issues' in e) {
				const err = e as ValidationFailure;
				issues.push(...(err.issues as SchemaIssue[]));
				return [input, undefined, { issues: [...err.issues] }];
			}
			throw e;
		}
	}
	const debounceValidate = debounce(validate, debounceMS);

	function reset(newInitialValue?: InferInput<V>) {
		state = 'unset';
		input = newInitialValue === undefined ? initialValue : newInitialValue;
		issues.length = 0;
	}

	return {
		get state() {
			return state;
		},
		get value() {
			return output;
		},
		set value(newValue: InferInput<V> | undefined) {
			state = 'set';
			input = newValue as InferInput<V>;
			output = newValue as InferOutput<V>;
			void debounceValidate();
		},
		get issues() {
			return issues;
		},
		validate,
		reset
	};
}

export function createField<V extends BaseSchema>(
	schema: V,
	initialValue: InferInput<V> = undefined as unknown as InferInput<V>,
	{ debounceMS = 300 }: Config = {}
): Field<V> {
	if ((schema as unknown as { entries?: unknown }).entries) {
		return createObjectField(schema as unknown as ObjectSchemaType, initialValue, {
			debounceMS
		}) as Field<V>;
	}
	if ((schema as unknown as { item?: unknown }).item) {
		return createArrayField(schema as unknown as ArraySchemaType, initialValue, {
			debounceMS
		}) as Field<V>;
	}
	return createPrimitiveField(schema, initialValue, debounceMS) as Field<V>;
}

export function createForm<V extends ObjectSchemaType>(
	schema: V,
	initialValue: InferInput<V> = {} as unknown as InferInput<V>,
	{ debounceMS = 300 }: Config = {}
) {
	return createObjectField(schema, initialValue, { debounceMS });
}
