<script lang="ts">
	let average = 0;
	let pass = 0;
	let filteredPromise = getTotalResult(average, 0);
	let promise = getTotalResult(0, pass);

	async function getTotalResult(average: number, pass: number) {
		return new Promise<any>((resolve, reject) => {
			if (average < 0) average = 100;
			if (pass < 0) pass = 100000;
			let body = JSON.stringify({
				WHERE: {
					AND: [
						{
							GT: {
								ubc_avg: average,
							},
						},
						{
							GT: {
								ubc_pass: pass,
							},
						},
					],
				},
				OPTIONS: {
					COLUMNS: ["ubc_dept", "ubc_id", "ubc_avg", "ubc_pass", "ubc_fail", "ubc_audit"],
				},
			});
			let request = new XMLHttpRequest();
			request.open("POST", "/query", true);
			request.setRequestHeader("Content-Type", "application/json");
			request.onload = function () {
				console.log(request.responseText);
				resolve(JSON.parse(request.responseText));
			};
			request.send(body);
		});
	}
</script>

<main>
	<div class="row">
		{#await filteredPromise}
			Loading dataset...
		{:then result}
			<div class="column">
				Minimum average:<input
					type="number"
					bind:value={average}
					on:change={() => {
						filteredPromise = getTotalResult(average, 0);
					}}
					min="0"
					max="100"
				/>
				<div class="error">You need to enter a number in the range [0, 100].</div>
				<div class="result">
					{#each result.result as r}
						<p>{r.ubc_dept}{r.ubc_id} had an average of {r.ubc_avg}%.</p>
					{/each}
				</div>
			</div>
		{:catch error}
			System error: {error.message}.
		{/await}
		{#await promise}
			Loading dataset...
		{:then result}
			<div class="column">
				Minimum number of students who passed:<input
					type="number"
					bind:value={pass}
					on:change={() => {
						promise = getTotalResult(0, pass);
					}}
					min="0"
				/>
				<div class="error">You need to enter a number larger than 0.</div>
				<div class="result">
					{#each result.result as r}
						<p>
							{r.ubc_pass} students passed {r.ubc_dept}{r.ubc_id}, which is {(
								(100 * r.ubc_pass) /
								(r.ubc_pass + r.ubc_fail + r.ubc_audit)
							).toFixed(2)}% of students.
						</p>
					{/each}
				</div>
			</div>
		{:catch error}
			System error: {error.message}.
		{/await}
	</div>
	<p></p>
</main>

<style>
	.column {
		float: left;
		width: 50%;
	}

	/* Clear floats after the columns */
	.row:after {
		content: "";
		display: table;
		clear: both;
		width: 100%;
	}

	main {
		width: 100%;
	}
	.error {
		display: none;
	}
	input:invalid + .error {
		display: initial;
		color: red;
	}
</style>
