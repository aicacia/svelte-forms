<script lang="ts" module>
	import type { StandardSchemaV1 } from '@standard-schema/spec';

	export interface IssuesProps {
		issues: StandardSchemaV1.Issue[];
	}
</script>

<script lang="ts">
	let { issues }: IssuesProps = $props();
</script>

{#if issues.length > 0}
	<ul class="mt-2 space-y-1">
		{#each issues as issue}
			<li class="text-sm text-red-500">{issue.message}</li>
		{/each}
	</ul>
{/if}
