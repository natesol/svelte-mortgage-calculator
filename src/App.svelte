<!-- ------------------------------------------------------------------------------------------------------------- -->
<!-- ------------------------------------------------------------------------------------------------------------- -->

<script>
    const formatterDollar = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
    });

    let amount = 200_000;
    let years = 15;
    let interest = 300;

    $: interestRate = interest / 20;
    $: totalPayments = years * 12;
    $: monthlyInterestRate = interestRate / 100 / 12;
    $: monthlyPayment =
        (loanAmount * Math.pow(1 + monthlyInterestRate, totalPayments) * monthlyInterestRate) /
        (Math.pow(1 + monthlyInterestRate, totalPayments) - 1)
    ;
    $: totalPaid = monthlyPayment * totalPayments;
    $: interestPaid = totalPaid - loanAmount;
    
</script>


<!-- ------------------------------------------------------------------------------------------------------------- -->
<!-- ------------------------------------------------------------------------------------------------------------- -->

<main>
    <form class="container">
        <legend class="row">
            <h1>Svelte Mortgage Calculator</h1>
        </legend>
        <div class="row">
            <label for="amount">Loan Amount</label>
            <input
                bind:value={amount}
                name="amount"
                type="number"
                min="1"
                max="999999999"
                placeholder="Enter loan amount"
                class="u-full-width"
            />
        </div>
        <div class="row">
            <div class="columns seven">
                <label for="years">Years</label>
                <input
                    bind:value={years}
                    name="years"
                    type="range"
                    min="1"
                    max="100"
                    steps="1"
                    class="u-full-width"
                />
            </div>
            <output class="columns five">{years}{years === 1 ? ' year' : ' years'}</output>
        </div>
        <div class="row">
            <div class="columns seven">
                <label for="interest">Interests Rate</label>
                <input
                    bind:value={interest}
                    name="interest"
                    type="range"
                    min="1"
                    max="2000"
                    steps="1"
                    class="u-full-width"
                />
            </div>
            <output class="columns five">{interestRate.toFixed(2)}%</output>
        </div>
    </form>

    <output class="row">Monthly Payment: {monthlyPayment}</output>
    <output class="row">Total Payment: {totalPayments}</output>
    <output class="row">Interest Paid: {interestPaid}</output>
</main>


<!-- ------------------------------------------------------------------------------------------------------------- -->
<!-- ------------------------------------------------------------------------------------------------------------- -->

<style>
    h1 {
        font-size: 2.5rem;
        font-weight: 700;
    }

    input[type='range'] {
        padding: 0.4em 0;
    }

    output {
        text-align: center;
        margin-top: 2rem;
        border: solid 1px rgb(237, 239, 240);
        border-radius: 0.3em;
        width: 100%;
        display: inline-block;
    }
</style>
