<script lang="ts">
	import Example from './_Example.svelte';
	import SignIn from './_SignIn.svelte';
	import SignInCode from './_SignIn.svelte?raw';
	import Complicated from './_Complicated.svelte';
	import ComplicatedCode from './_Complicated.svelte?raw';
</script>

<div class="space-y-4">
	<section class="card">
		<div class="flex items-center justify-between">
			<h1>Examples</h1>
			<a
				href="https://github.com/aicacia/svelte-forms"
				target="_blank"
				rel="noopener noreferrer"
				class="text-blue-600 hover:text-blue-800 underline"
			>
				View on GitHub
			</a>
		</div>
	</section>

	<section class="card">
		<Example
			title="Sign In Form"
			description="A simple sign-in form with email and password validation."
			code={SignInCode}
		>
			<div class="mx-auto max-w-96">
				<SignIn />
			</div>
		</Example>
	</section>

	<section class="card">
		<Example
			title="Complicated Form"
			description="A more complicated form example with modifiable array fields and validation."
			code={ComplicatedCode}
		>
			<Complicated />
		</Example>
	</section>
</div>
