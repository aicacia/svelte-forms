# Svelte Forms [![npm](https://img.shields.io/npm/v/@aicacia/svelte-forms)](https://www.npmjs.com/package/@aicacia/svelte-forms) [![Web CI](https://github.com/aicacia/svelte-forms/actions/workflows/web.yml/badge.svg)](https://github.com/aicacia/svelte-forms/actions/workflows/web.yml)

Minimal, typed form state + validation for Svelte 5 using Valibot.

## Install

```bash
pnpm add @aicacia/svelte-forms valibot
```

## Quick Start

```svelte
<script lang="ts">
	import { object, string, minLength } from 'valibot';
	import { createForm } from '@aicacia/svelte-forms';

	const schema = object({
		name: string([minLength(1, 'Required')]),
	});

	const form = createForm(schema);
}
</script>

<input bind:value={form.fields.name.value} />
{#each form.issues as issue}
	<p>{issue.message}</p>
{/each}

<button
	onclick={async () => {
		const [_input, output, error] = await form.validate();
		// use output if valid
	}}
>
	Submit
</button>
```

## Features

- Typed inputs/outputs via Valibot
- Nested object/array fields
- Debounced per-field validation
- Simple states: validating, valid, invalid, unset, set

## API

- `createForm(schema, initial?, debounceMS?)`
- `createField(schema, initial?, debounceMS?)`
