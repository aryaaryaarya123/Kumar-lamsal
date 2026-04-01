export const PORTFOLIO = {
    "Arya Lamsal":  { NHPC: 10, NRN: 15 },
    "Aryan Lamsal": { BANDIPUR: 10, HFIN: 10, SKHL: 10, NRN: 15 },
    "Yashoda":      { BANDIPUR: 10, PPCL: 20 },
    "Agaman":       { SOLU: 10, NRN: 15 },
    "Kumar":        { DHEL: 10, HBL: 10, OMPL: 10, SYPNL: 10 }
};

export const IPO_PRICE = 100;
export const TOTAL_INVESTMENT = 16500;

export const MOCK_PRICES: Record<string, { price: number; change: number }> = {
    NHPC: { price: 285.50, change: 5.2 },
    NRN: { price: 850.00, change: -12.5 },
    BANDIPUR: { price: 420.10, change: 10.0 },
    HFIN: { price: 315.00, change: -2.0 },
    SKHL: { price: 290.00, change: 8.5 },
    PPCL: { price: 410.50, change: 15.0 },
    SOLU: { price: 380.00, change: -5.0 },
    DHEL: { price: 210.00, change: 2.0 },
    HBL: { price: 245.00, change: 1.5 },
    OMPL: { price: 510.00, change: -8.0 },
    SYPNL: { price: 340.00, change: 12.0 }
};

export const formatCurrency = (num: number) => new Intl.NumberFormat('en-NP', { style: 'currency', currency: 'NPR' }).format(num);
export const formatPercent = (num: number) => num.toFixed(2) + '%';

export function getNepalTime() {
    const now = new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    return new Date(utc + (3600000 * 5.75));
}

export function checkMarketStatus() {
    const npTime = getNepalTime();
    const day = npTime.getDay();
    const hours = npTime.getHours();
    const minutes = npTime.getMinutes();
    
    // Sun=0 to Thu=4
    const isTradingDay = day >= 0 && day <= 4;
    const isTradingHours = (hours > 11 || (hours === 11 && minutes >= 0)) && (hours < 15 || (hours === 15 && minutes === 0));
    
    return isTradingDay && isTradingHours;
}
