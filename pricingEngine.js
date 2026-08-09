class PricingEngine {
  static calculate(params) {
    const {
      actionType,
      baseAmount,
      marginPercentage = 0,
      minAmount = 0,
      mode = 'MANUAL',
      usdRate = 60000,
      currency = 'toman'
    } = params;

    let baseInToman = baseAmount;
    if (currency === 'usd') {
      baseInToman = baseAmount * usdRate;
    }

    const isAboveMin = baseInToman >= minAmount;

    let marginAmount = 0;
    let finalAmount = 0;

    if (actionType === 'BUY') {
      marginAmount = baseInToman * (marginPercentage / 100);
      finalAmount = baseInToman + marginAmount;
    } else if (actionType === 'SELL') {
      marginAmount = baseInToman * (marginPercentage / 100);
      finalAmount = baseInToman - marginAmount;
    } else {
      return {
        success: false,
        error: 'نوع عملیات نامعتبر است. باید BUY یا SELL باشد.'
      };
    }

    return {
      success: true,
      actionType,
      baseAmount: baseInToman,
      baseAmountOriginal: baseAmount,
      marginPercentage,
      marginAmount: Math.round(marginAmount),
      finalAmount: Math.round(finalAmount),
      minAmount,
      isAboveMin,
      mode,
      status: mode,
      currency,
      usdRate
    };
  }

  static runTests() {
    const results = [];
    let allPassed = true;

    const test1 = this.calculate({
      actionType: 'BUY',
      baseAmount: 100000,
      marginPercentage: 10,
      minAmount: 0,
      mode: 'AUTO'
    });
    const passed1 = test1.finalAmount === 110000 && test1.marginAmount === 10000;
    results.push({ name: 'خرید با ۱۰٪ سود (مبلغ ۱۰۰,۰۰۰)', passed: passed1 });
    if (!passed1) allPassed = false;

    const test2 = this.calculate({
      actionType: 'SELL',
      baseAmount: 100000,
      marginPercentage: 10,
      minAmount: 0,
      mode: 'AUTO'
    });
    const passed2 = test2.finalAmount === 90000 && test2.marginAmount === 10000;
    results.push({ name: 'فروش با ۱۰٪ سود (مبلغ ۱۰۰,۰۰۰)', passed: passed2 });
    if (!passed2) allPassed = false;

    return { allPassed, results };
  }
}

module.exports = PricingEngine;
