import axios from 'axios';
import fs from 'fs';

const apiKey = 'Your API Key Here'; // Replace with your Mizar API key
const apiEndpoint = 'https://api.mizar.com/api/v1/';   // API endpoint address
const interval = 60000 * 1;   // Interval 1Min*Number mins 
const subscriptionId = 20641; // Replace with the desired Mizar subscription ID
const bot_id = 5083;          // Replace with the desired Mizar bot ID
const TakeProfitMult = 1.25   // Take Profit Modifier per S.O. (low number for flat, high for Bull)
const logFile = 'mizar_log.txt';
let checkmessage='Checking';

//await sleep(2500); // give user time to switch on PM2 Monit and see log output

log(`Mizar Assistant (**No warranty, Long ONLY, tested at 10x Long cross only*) bot:${bot_id} & subscription:${subscriptionId} TP% adjustment factor:${TakeProfitMult}`,'hide');
monitorTradingPositions(); // Call the main loop

async function monitorTradingPositions() {
  while (true) {
    try {
      const settingsResponse = await axios.get(`${apiEndpoint}dca-bots/get-settings`, {
        headers: {
          'mizar-api-key': apiKey,
        },
      });

      const strategyData = settingsResponse.data.data.find(strategy => strategy.strategy_id === bot_id);

      if (!strategyData) {
        throw new Error(`Strategy with ID ${bot_id} not found.`);
      }

      const mizarTakeProfit = strategyData.take_profit || 0;
      const mizarSafetyTradesCount = strategyData.max_safety_trades_count || 0;

      const response = await axios.get(`${apiEndpoint}subscription/get-open-positions?subscription_id=${subscriptionId}&bot_id=${bot_id}`, {
        headers: {
          'mizar-api-key': apiKey,
        },
      });

      const positions = response.data.data;

      if (positions.length === 0) {
        log(`No open positions found.`);
      } else {
        // Iterate through positions
        const tableData = [];
        for (const position of positions) {
          const safetyOrders = await countUsedSafetyOrders(position);
          const newTakeProfit = mizarTakeProfit + (safetyOrders * (TakeProfitMult-1));
          const existingTakeProfit = (position.take_profit_pct * 100).toFixed(2);
          const tradingPair = position.symbol;
          const [baseAsset, quoteAsset] = getTradingPairAssets(tradingPair);

          // Check if the Actual and Target take profits are different
                   
          if (existingTakeProfit !== newTakeProfit.toFixed(2)) {
            // Update take profit
            checkmessage='*UPDATING*'
            
            const payload = {
              bot_id: bot_id,
              base_asset: baseAsset,
              quote_asset: quoteAsset,
              side: 'long',
              take_profit_pct: (newTakeProfit.toFixed(4) / 100),
            };

            await updateTakeProfit(payload);
          } else {
            checkmessage='Checking'
          }
          
          tableData.push({
            'Coin'              : baseAsset,
            'S.O.'              : safetyOrders,
            'PNL(%)'            : '-',
            'T.P. (%)' 			: newTakeProfit.toFixed(2),
            'TP/SL active'		: '-',
            'T/A Data'          : '-',
            'Status'            : checkmessage,
          });
          log(`Pair: ${position.symbol.slice(0, 5)}... - Safety Orders: ${safetyOrders} - ${checkmessage} Take Profit: ${newTakeProfit.toFixed(2)}%`,'hide');
        }

        if (tableData.length > 0) {
          console.clear();
          console.log(`Mizar Assistant, 10x Long/cross bot:${bot_id} Subs.:${subscriptionId} TP% Modifier:${TakeProfitMult}`);
          console.table(tableData);
		  console.log(Date())
		  console.log(`complete, next in ${interval/60000} Min.`);
	  
        //log(`Pair:${position.symbol.slice(0, 5)}... - Safety Orders:${safetyOrders} - ${checkmessage} Take Profit :${newTakeProfit.toFixed(2)}%`,'hide'); 
        }
      }
    } catch (error) {
      log(`Error fetching trading positions: ${error.message}`);
    }

    await sleep(interval);
  }
}

async function countUsedSafetyOrders(position) {
  const tradingPair = position.symbol;
  const [baseAsset, quoteAsset] = getTradingPairAssets(tradingPair);

	await new Promise(resolve => setTimeout(resolve, 1000));

  try {
    const response = await axios.get(`${apiEndpoint}dca-bots/get-safety-orders?bot_id=${bot_id}&base_asset=${baseAsset}&quote_asset=${quoteAsset}&side=long`, {
      headers: {
        'mizar-api-key': apiKey,
      },
    });

    const safetyOrders = response.data.data;
    let filledCount = 0;
	  for (const order of safetyOrders) {
      if (order.status === 'closed') {
        filledCount++;
      }
    }

    return filledCount;
  } catch (error) {
    log(`Error fetching safety orders: ${error.message}`);
    return 0;
  }
}

function getTradingPairAssets(tradingPair) {
  // Assuming the trading pair is in the format "AVAXUSDT"
  const baseAsset = tradingPair.substring(0, tradingPair.length - 4);
  const quoteAsset = tradingPair.substring(tradingPair.length - 4);

  return [baseAsset, quoteAsset];
}

async function updateTakeProfit(payload) {
  try {
    await axios.post(`${apiEndpoint}dca-bots/edit-take-profit-pct`, payload, {
      headers: {
        'mizar-api-key': apiKey,
        'Content-Type': 'application/json',
      },
    });

    // Beep to indicate a successful API call
    //process.stdout.write('\x07');
    //console.log('API WRITE: Take profit updated successfully.');
  } catch (error) {
    log(`Error updating take profit: ${error.message}`);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function log(message,mode) {
  const now = new Date();
  const options = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  };

  const timestamp = now.toLocaleString(undefined, options);

  if (mode !== 'hide') {
    console.log(`${timestamp} - ${message}`); // Log to the console
}
  
  fs.appendFileSync(logFile, `${timestamp} - ${message}\n`, 'utf8'); // Append the message with timestamp to the log file
}
