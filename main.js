var docReady = $.Deferred();
$(docReady.resolve);

var abiPromise = $.get("abi.json");
var contractAddressPromise = $.get("contract_address");
var dictionaryPromise = $.get("data_dictionary.json");
var startBlockPromise = $.get("start_block");
var contract;
var dictionary;
var startBlock;
var global_intervals = [];
var global_filters = [];

var web3Promise = new Promise(function (resolve, reject) {
    var interval = setInterval(function () {
        if (typeof web3 !== 'undefined') {
            resolve(web3);
            clearInterval(interval);
        }
    }, 50);
});
$.when(contractAddressPromise, abiPromise, dictionaryPromise, startBlockPromise, docReady, web3Promise)
    .always(function (contractAddress, abiJSON, dictionary, startBlock) {
    var contractAddress = contractAddress[0];
    var abi = abiJSON[0];
    window.dictionary = dictionary[0];
    window.startBlock = startBlock[0];
    contract = web3.eth.contract(abi).at(contractAddress);

    routeFromURL();

});

function routeFromURL() {
    global_intervals.forEach(clearInterval);
    global_filters.forEach(filter => filter.stopWatching());
    var parts = window.location.hash.slice(1).split('_');
    route(parts[0], parts.slice(1))
}
window.addEventListener("hashchange", routeFromURL);

function route(page, params) {
    var html = "";
    
    // Emptying the view container is the most reliable way of deleting 
    // old event listeners. Each page load re-assigns event handlers
    $('#view-container').empty().hide();
    switch (page) {
        case 'spread':
            $("#view-container").html($("#bets-page").html());
            betsPage(params[0], 1);
            break;
        case 'moneyline':
            $("#view-container").html($("#bets-page").html());
            betsPage(params[0], 2);
            break;
        case 'overunder':
            $("#view-container").html($("#bets-page").html());
            betsPage(params[0], 3);
            break;
        case 'creategame':
            $("#view-container").html($("#create-game").html());
            createGamePage();
            break;
        case 'withdraw':
        case 'profile':
            $("#view-container").html($("#profile").html());
            profilePage();
            break;
        case 'results':
            $("#view-container").html($("#results").html());
            resultsPage();
            break;
        case 'manage':
            $("#view-container").html($("#manage-game").html());
            manageGamePage(params[0]);
            break;
        case 'games':
        default:
            $("#view-container").html($("#games").html());
            gamesPage();
    }
    $('#view-container').show();
}

function getWalletAddress () {
    return new Promise(function (resolve, reject) {
        // metamask
        if (web3 && web3.eth.accounts[0]) {
            var walletAddress = web3.eth.accounts[0];
            sessionStorage.walletAddress = walletAddress;
            resolve(walletAddress);
        }
        // get cached if available for mist
        else if (sessionStorage.walletAddress)
            resolve(sessionStorage.walletAddress);
        else if (typeof mist !== 'undefined') {
            mist.requestAccount(function (err, walletAddress) {
                if (err) reject(err);
                else {
                    // cache then resolve
                    sessionStorage.walletAddress = walletAddress[0];
                    resolve(walletAddress[0]);
                }
            })
        }
    })
}

function getGames () {
    // get cached if available
    if (getGames.prototype.games)
        return Promise.resolve(getGames.prototype.games);

    var activeGamesPromise = new Promise((resolve, reject) => {
        contract.getActiveGames.call(function (err, game_ids) {
            if (err) reject(err);
            else resolve(game_ids);
        });
    });
    var gamesPromise = new Promise((resolve, reject) => {
        activeGamesPromise.then(game_ids => {
            contract.GameCreated({ id: game_ids }, { fromBlock: startBlock })
                .get(function (err, logs) {
                    var games = logs.map(log => log.args);
                    resolve(games);
                });
        });
    });
    var scoresPromise = new Promise((resolve, reject) => {
        activeGamesPromise.then(game_ids => {
            contract.GameScored({ game_id: game_ids }, { fromBlock: startBlock })
                .get((err, logs) => {
                    var scores = logs.map(log => log.args);
                    resolve(scores);
                });
        });
    });

    return new Promise((resolve, reject) => {
        $.when(gamesPromise, scoresPromise).then((games, scores) => {
            var scoresObj = {}
            scores.forEach(score => scoresObj[score.game_id] = score);
            games.forEach(game => {
                if (scoresObj[game.id]) {
                    game.result = { 
                        home: scoresObj[game.id].homeScore, 
                        away: scoresObj[game.id].awayScore
                    }
                }
                else
                    game.result = { home: '-', away: '-' }
            });
            getGames.prototype.games = games;
            resolve(games);
        });
    });
}

function getGame(id) {
    return getGames().then(function (games) {
        var game = games.filter(g => g.id == id)[0];
        return game;
    })
}

function gamesPage() {
    getGames().then(function (games) {
        $("#games-table tbody").empty();
        var now = new Date().getTime() / 1000;
        games.filter(game => game.locktime > now)
            .sort((a,b) => a.locktime - b.locktime)
            .forEach(game => addGameToTable(game, "#games-table"));
    });
}

function resultsPage () {
    getGames().then(function (games) {
        $("#results-table tbody").empty();
        var now = new Date().getTime() / 1000;
        games.filter(game => game.locktime < now)
            .sort((a,b) => b.locktime - a.locktime)
            .forEach(game => addGameToTable(game, "#results-table"));
    });
}

    
function addGameToTable (game, table) {
    var category = dictionary.categories[parseInt(game.category)];
    var gametime = new Date(parseInt(game.locktime) * 1000);
    var date = gametime.toString().slice(0,10);
    var time = gametime.toTimeString().slice(0,5);

    var row = `<tr class="game">
        <td>
            <div class="logo logo-home"></div>
            <span class="home">${game.home}</span>
        </td>
        <td>
            <div class="logo logo-away"></div>
            <span class="away">${game.away}</span>
        </td>`;
    if (table == "#results-table" || table == "#my-games-table")
        row += `<td>${game.result.home} - ${game.result.away}</td>`;
    row += ` <td>${category}</td>
        <td>${date}</td>
        <td>${time}</td>`;
    row += `<td class="bets-cell">
        <a href="#spread_${game.id}"><button class="btn btn-bet">SPREAD</button></a>
        <a href="#moneyline_${game.id}"><button class="btn btn-bet">MONEY LINE</button></a>
        <a href="#overunder_${game.id}"><button class="btn btn-bet">OVER UNDER</button></a>
    </td>`;
    row += `</tr>`;
    $(`#view-container ${table} tbody`).append(row);
    $(`#view-container ${table} tr`).last().data('id', game.id);

    // set logos
    var homePos = getLogoPosition(game.home);
    var awayPos = getLogoPosition(game.away);
    $(`#view-container ${table} .logo-home`).last()
        .css('background-position-x', homePos.x)
        .css('background-position-y', homePos.y);
    $(`#view-container ${table} .logo-away`).last()
        .css('background-position-x', awayPos.x)
        .css('background-position-y', awayPos.y);
}

function getLogoPosition(team) {
    var index = dictionary.logos.NBA.indexOf(team);
    return {
        x: -16 - 37*(index % 6), 
        y: -14 - 35*Math.floor(index / 6)
    }
}
    

function getETHtoUSDConversion () {
    return new Promise(function (resolve, reject) {
        if (sessionStorage.eth_usd)
            resolve(parseInt(sessionStorage.eth_usd));
        else {
            $.get("https://coinmarketcap-nexuist.rhcloud.com/api/eth")
            .then(function (data) {
                sessionStorage.eth_usd = data.price.usd;
                resolve(data.price.usd);
            });
        }
    });
}

function getBets(game_id, book) {
    return new Promise(function (resolve, reject) {
        // if cache is set and is for this game
        if (getBets.prototype.game_id == game_id &&
            getBets.prototype.book === book)
            resolve(getBets.prototype.bets);
        else {
            contract.BetPlaced({ game_id: game_id, book: book }, { fromBlock: startBlock })
                .get(function (err, logs) {
                    var bets = logs.map(log => log.args);
                    if (window.location.hash.split('_')[0] == '#spread')
                        bets.forEach(bet => bet.line /= 10);
                    getBets.prototype.game_id = game_id;
                    getBets.prototype.book = book;
                    getBets.prototype.bets = bets;
                    resolve(bets);
                });
        }
    });
}

function getMyBets(game_id, book) {
    return new Promise(function (resolve, reject) {
        // if cache is set and is for this game
        if (getMyBets.prototype.game_id == game_id &&
            getMyBets.prototype.book == book)
            resolve(getMyBets.prototype.bets);
        else {
            getWalletAddress().then(function (walletAddress) {
                contract.BetPlaced({ game_id: game_id, book: book, user: walletAddress }, { fromBlock: startBlock })
                    .get(function (err, logs) {
                        var bets = logs.map(log => log.args);
                        if (window.location.hash.split('_')[0] == '#spread')
                            bets.forEach(bet => bet.line /= 10);
                        getMyBets.prototype.game_id = game_id;
                        getMyBets.prototype.book = book;
                        getMyBets.prototype.bets = bets;
                        resolve(bets);
                    });
            });
        }
    });
}

function getOpenBidsByLine(game_id, book) {
    return new Promise(function (resolve, reject) {
        // use cache if less than 5 seconds old and is the right game and book
        if (getOpenBidsByLine.prototype.lastUpdate &&
            getOpenBidsByLine.prototype.lastUpdate.getTime() + 4000 > new Date().getTime() && 
            getOpenBidsByLine.prototype.game_id == game_id &&
            getOpenBidsByLine.prototype.book == book)
            resolve(getOpenBidsByLine.prototype.bids);
        contract.getOpenBidsByLine.call(game_id, book, function (err, hex) {
            var bids = parseBids(hex);
            getOpenBidsByLine.prototype.bids = bids;
            getOpenBidsByLine.prototype.lastUpdate = new Date();
            getOpenBidsByLine.prototype.game_id = game_id;
            getOpenBidsByLine.prototype.book = book;
            resolve(bids);
        });
    });
}

function getMyOpenBids(game_id, book, walletAddress) {
    return new Promise(function (resolve, reject) {
        // use cache if less than 5 seconds old and is the right game
        if (getMyOpenBids.prototype.lastUpdate &&
            getMyOpenBids.prototype.lastUpdate.getTime() + 4000 > new Date().getTime() && 
            getMyOpenBids.prototype.game_id == game_id &&
            getMyOpenBids.prototype.book == book)
            resolve(getMyOpenBids.prototype.bids);
        getWalletAddress().then(function (walletAddress) {
            contract.getOpenBidsByBidder.call(game_id, book, walletAddress, function (err, hex) {
                var bids = parseBids(hex);
                getMyOpenBids.prototype.bids = bids;
                getMyOpenBids.prototype.lastUpdate = new Date();
                getMyOpenBids.prototype.game_id = game_id;
                getMyOpenBids.prototype.book = book;
                resolve(bids);
            });
        });
    });
}
            
function updateBids (game_id, book) {
    getOpenBidsByLine(game_id, book).then(function (bids) {
        $("#home-bids-table tbody, #away-bids-table tbody").empty();
        bids.forEach(bid => {
            if (bid.home) addBidToTable("#home-bids-table", bid);
            else addBidToTable("#away-bids-table", bid);
        });
    });
    $.when(getGame(game_id), getMyOpenBids(game_id, book)).then(function (game, bids) {
        $("#my-bids-table tbody").empty();
        bids.forEach(bid => {
            bid.team = bid.home ? game.home : game.away;
            addBidToTable("#my-bids-table", bid);
        });
    });
}
    

function betsPage(id, book) {
    $("#home-bids-table tbody, #away-bids-table tbody, #my-bets-table tbody, #my-bids-table tbody").empty();
    $("#score-row").hide();

    getGame(id).then(function (game) {
        $('.home').html(game.home);
        $('.away').html(game.away);

        // display logos
        var homePos = getLogoPosition(game.home);
        var awayPos = getLogoPosition(game.away);
        $(`#view-container .logo-home`)
            .css('background-position-x', homePos.x)
            .css('background-position-y', homePos.y);
        $(`#view-container .logo-away`)
            .css('background-position-x', awayPos.x)
            .css('background-position-y', awayPos.y);

        // Display gametime 
        var locktime = new Date(game.locktime * 1000);
        var timeString = locktime.toLocaleTimeString();
        var dateString = locktime.toLocaleDateString();
        var timeString = locktime.toLocaleTimeString('en-us',
            { timeZoneName: 'short' });
        $('.locktime').html(`${dateString} ${timeString}`);

        // Hide betting 10 min prior to gametime
        var now = new Date();
        var tenMinutes = 10*60*1000;
        if (locktime - now < tenMinutes) {
            $("#bet-placements, #open-bids-row").hide();
            $(".game-status")
                .removeClass('open')
                .addClass('closed')
                .html("Betting is closed");
        }
        else {
            $("#bet-placements, #open-bids-row").show();
            $(".game-status")
                .removeClass('closed')
                .addClass('open')
                .html("Betting locks 10 min prior to gametime");
        }

        // Display scores
        if (now > locktime) {
            $('.home-score').html(`${game.result.home}`);
            $('.away-score').html(`${game.result.away}`);
            $('#score-row').show();
        }
    });
    getBets(id, book).then(function (bets) {
        $("#view-container #bets-table tbody").empty(); 
        if (bets.length == 0)
            return false;
        bets.filter(bet => bet.home)
            .forEach(bet => addBetToTable("#bets-table", bet));
        var currentLine = bets.filter(bet => bet.home).reverse()[0].line;
        $("#home-line").val(currentLine);
        if (window.location.hash.split('_')[0] == '#overunder')
            $("#away-line").val(currentLine);
        else
            $("#away-line").val(-currentLine);
    });
    updateBids(id, book);
    var updateBidsInterval = setInterval(() => updateBids(id, book), 5000);
    global_intervals.push(updateBidsInterval);

    getMyBets(id, book).then(function (myBets) {
        myBets.forEach(bet => updateMyBets(bet, id));
    });

    // listeners for bet placement
    getWalletAddress().then(function (walletAddress) {
        $("#place-bet-home").click(function (e) {
            if ($("#home-amount").val().trim() == '' || $("#home-line").val().trim() == '')
                return false;

            // prevent double betting
            e.target.disabled = true; 
            setTimeout(() => e.target.disabled = false, 3000);

            var id = window.location.hash.split('_')[1];
            var line = parseFloat($("#home-line").val()) * 10;
            var amount = parseFloat($("#home-amount").val()) * 1e18;
            contract.bid.estimateGas(id, 0, true, line, function (err, gas) {
                gas = 500000;
                contract.bid(id, 0, true, line, 
                    { from: walletAddress, value: amount , gas: gas }, 
                    function (err, tx_hash) {
                        e.target.disabled = false;
                        if (!tx_hash) // rejected transaction
                            return false;
                        $("#home-amount").val('');
                        var team = $('.home').first().html();
                        if (line > 0)
                            line = '+' + line;
                        var notice = `
                            <div class="alert alert-success">
                                Bet placed. Transaction processing. View status <a href="https://etherscan.io/tx/${tx_hash}">here</a>
                            </div>`;
                        $("#bet-alerts").append(notice);
                    });
            });
        });
        $("#place-bet-away").click(function (e) {
            if ($("#away-amount").val().trim() == '' || 
                $("#away-line").val().trim() == '')
                return false;

            // prevent double betting
            e.target.disabled = true; 
            setTimeout(() => e.target.disabled = false, 3000);

            var id = window.location.hash.split('_')[1];
            var line = parseFloat($("#away-line").val()) * 10;
            var amount = parseFloat($("#away-amount").val()) * 1e18;
            contract.bidSpread.estimateGas(id, false, line, function (err, gas) {
                gas = 500000;
                contract.bidSpread(id, false, line, 
                    { from: walletAddress, value: amount , gas: gas },
                    function (err, tx_hash) {
                        e.target.disabled = false;
                        if (!tx_hash) // rejected transaction
                            return false;
                        $("#away-amount").val('');
                        var team = $('.away').first().html();
                        if (line > 0)
                            line = '+' + line;
                        var notice = `Bet placed. Transaction processing. View status 
                            <a href="https://etherscan.io/tx/${tx_hash}">here</a>`;
                        $("#bet-description-away").html(notice);
                    });
            });
        });
    });

    // cancel bid listener
    $(document).on("click", ".cancel-bid", function (e) {
        var game_id = window.location.hash.split('_')[1];
        $.when(getWalletAddress(), getGame(game_id))
        .then(function (walletAddress, game) {
            var $parentRow = $(e.target).parents("tr");
            var team = $parentRow.find("td").first().html();
            var home = team == game.home;
            var line = parseFloat($parentRow.find("td").eq(1).html()) * 10;
            contract.cancelBid.sendTransaction(walletAddress, game_id, 
                line, home, { from: walletAddress, gas: 200000 },
                function (err, tx_hash) {
                    $parentRow.remove();
                });
        });
    });

    // Update description when bet changes
    $(".form-control").on('keyup', function (e) {
        var $parent = $(e.target).parents(".col-md-6")
        var $description = $parent.find(".bet-description");  
        var line = $parent.find(".line").val();
        if (parseInt(line) > 0)
            line = "+" + line;
        var amount = $parent.find(".amount").val();
        var team = $parent.find("#place-bet-home").length == 1 ? 
            $parent.find(".home").html() : $parent.find(".away").html();
        $description.html(`Bet ${amount} ETH @ ${team} (${line})`);
    });

    // contract event listeners
    var betPlacedFilter = contract.BetPlaced({ game_id: id });
    betPlacedFilter.watch(function (err, log) {
        var bet = log.args;
        if (bet.home)
            addBetToTable("#bets-table", bet);
        getWalletAddress().then(function (walletAddress) {
            if (bet.user == walletAddress)
                updateMyBets(bet, id);
        });
    });
    global_filters.push(betPlacedFilter);

}

function updateMyBets (bet, game_id) {
    getGame(game_id).then(function (game) {
        if (!updateMyBets.prototype.lines || updateMyBets.prototype.game_id !=  game_id) {
            updateMyBets.prototype.lines = { home: {}, away: {} };
            updateMyBets.prototype.game_id = game_id;
        }
        var side = bet.home ? 'home' : 'away';
        var line = parseInt(bet.line);
        if (updateMyBets.prototype.lines[side][line])
            updateMyBets.prototype.lines[side][line] += parseInt(bet.amount);
        else
            updateMyBets.prototype.lines[side][line] = parseInt(bet.amount);

        $("#my-bets-table tbody").empty();
        Object.keys(updateMyBets.prototype.lines.home)
            .forEach(line => addBetToTable("#my-bets-table", { 
                team: game.home, 
                line: line, 
                amount: updateMyBets.prototype.lines.home[line] 
            }));
        Object.keys(updateMyBets.prototype.lines.away)
            .forEach(line => addBetToTable("#my-bets-table", { 
                team: game.away, 
                line: line, 
                amount: updateMyBets.prototype.lines.away[line] 
            }));
    });
}

function addBidToTable (table, bid) {
    var side = bid.home ? "home" : "away";
    var amount = bid.amount / 1e18;
    if (window.location.hash.split('_')[0] == '#spread')
        var line = bid.line / 10;
    else 
        var line = bid.line;

    var row = `<tr class="bid">`;
    if (table == "#my-bids-table") {
        row += `<td>
            <div class="logo"></div>
            <span>${bid.team}</span>
        </td>`;
    }
    row += `<td>${line}</td>
        <td class="currency">${amount}</td>`;
    if (table == "#my-bids-table") {
        row += `<td><a class="cancel-bid">Cancel</a></td>`;
    }
    row += `</tr>`;
    $(table + " tbody").prepend(row);

    // set logos
    var logoPos = getLogoPosition(bid.team);
    $(`#view-container ${table} .logo`).first()
        .css('background-position-x', logoPos.x)
        .css('background-position-y', logoPos.y);
}

function addBetToTable(table, bet) {
    var row = `<tr class="bet">`;
    var amount = bet.amount / 1e18;
    var line = bet.line;

    if (table == "#profile-bets-table")
        row += `<td>${bet.date}</td>`;
    if (table == "#profile-bets-table" || table == "#my-bets-table") {
        row += `<td>
                <div class="logo"></div>
                <span>${bet.team}</span>
            </td>`;
    }
    row += `<td>${line}</td>
        <td class="currency">${amount}</td>
    </tr>`;
    $("#view-container " + table + " tbody").prepend(row);

    // set logos
    var logoPos = getLogoPosition(bet.team);
    $(`#view-container ${table} .logo`).first()
        .css('background-position-x', logoPos.x)
        .css('background-position-y', logoPos.y);
}

function parseBid(hex) {
    return {
        bidder: '0x' + hex.slice(0,40),
        amount: parseInt(hex.slice(40,104), 16),
        home: parseInt(hex.slice(104,106)) == 1,
        line: ~~parseInt(hex.slice(106), 16)
    }
}

function parseShortBid(hex) {
    return {
        amount: parseInt(hex.slice(0,64), 16),
        home: parseInt(hex.slice(64,66)) == 1,
        line: ~~parseInt(hex.slice(66), 16)
    }
}

function parseBids(hex) {
    if (hex.slice(0,2) == '0x')
        hex = hex.slice(2);
    var short = (hex.length % 74 == 0);
    var bids = []
    if (short) {
        for (var i=0; i < hex.length; i += 74) 
            bids.push(parseShortBid(hex.slice(i, i+74)));
    }
    else {
        for (var i=0; i < hex.length; i += 114)
            bids.push(parseBid(hex.slice(i, i+114)));
    }

    return bids;
}

function scoreGame () {
    getWalletAddress().then(function (walletAddress) {
        var inputs = $(e.target).siblings('input');
        var homeScore = inputs[0].valueAsNumber;
        var awayScore = inputs[1].valueAsNumber;
        var game_id = $(e.target).parents("tr").data('id');
        contract.setGameResult(game_id, homeScore, awayScore, 
            { from: walletAddress, gas: 1000000 });
        $("#admin-status").html("Game scored. Transaction sent");
    });
}

function createGame () {
}

function profilePage() {
    getWalletAddress().then(function (walletAddress) {
        $("#profile-address").html(walletAddress);
        contract.balances.call(walletAddress, function (err, balance) {
            $("#profile-balance").html(parseFloat(balance / 1e18));
            if (balance == 0)
                $("#profile-withdraw").hide();
        });
        getGames().then(function (games) {
            $("#my-games-table tbody").empty();
            games.filter(game => game.creator == walletAddress)
                .forEach(game => addGameToTable(game, "#my-games-table"));
        });
        contract.BetPlaced({ user: walletAddress }, {  fromBlock: startBlock })
            .get(function (err, logs) {
                var bets = logs.map(log => log.args);
                var games = {}
                bets.forEach(bet => games[bet.game_id] = {});
                var game_ids = bets.forEach(bet => bet.game_id);
                contract.GameCreated({ id: game_ids }, { fromBlock: startBlock })
                .get(function (err, logs) {
                    logs.forEach(log => games[log.args.id] = log.args);
                    $("#profile-bets-table tbody").empty();
                    bets.forEach(bet => {
                        var game = games[bet.game_id];
                        bet.team = bet.home ? game.home : game.away;
                        bet.date = new Date(game.locktime * 1000).toLocaleDateString();
                        addBetToTable("#profile-bets-table", bet);
                    });
                });
            });
        contract.Withdrawal({ user: walletAddress }, { fromBlock: startBlock })
            .get(function (err, logs) {
                var withdrawals = logs.map(log => log.args);
                $("#profile-withdrawals-table tbody").empty();
                withdrawals.forEach(addWithdrawalToTable);
            });
        
        $("#profile-withdraw").click(function (e) {
            e.target.disabled = true;
            getWalletAddress().then(walletAddress => {
                contract.withdraw({ from: walletAddress, gas: 50000 },
                    function (err, tx_hash) {
                        if (err) {
                            e.target.disabled = false;
                            return false;
                        }
                        $("#profile-status").html(`Withdrawal initiated. View status 
                            <a href="https://etherscan.io/tx/${tx_hash}">here</a>`);
                    });
            });
        });
    });
}

function addWithdrawalToTable(withdrawal) {
    var timestamp = new Date(parseInt(withdrawal.timestamp) * 1000);
    var dateString = timestamp.toLocaleDateString();
    var timeString = timestamp.toLocaleTimeString();
    var amount = parseFloat(withdrawal.amount / 1e18);
    var row = `<tr>
        <td>${dateString} ${timeString}</td>
        <td class="currency">${amount}</td>
    </tr>`;
    $("#profile-withdrawals-table tbody").append(row);
}

function createGamePage() {
    updateTeams('NBA');
    $("#create-game-submit").click(function () {
        getWalletAddress().then(function (walletAddress) {
            var home = $("#create-game-home").val();
            var away = $("#create-game-away").val();
            var category = parseInt($("#create-game-category").val());
            var offset = new Date().getTimezoneOffset() * 60 * 1000;
            var locktime = (document.querySelector("#create-game-locktime").valueAsNumber + offset) / 1000;
            contract.createGame(home, away, category, locktime, 
                { from: walletAddress, gas: 400000 }, function (err, tx_hash) {
                    if (err) return false;
                    $("#create-game-status").html(`Creating game. View status 
                            <a href="https://etherscan.io/tx/${tx_hash}">here</a>`);
                    $(".create-game-input").val('');
                });
        });
    });
}

function updateTeams(category) {
    $("#create-game-home, #create-game-away").empty();
    dictionary.logos[category].sort().forEach(team => {
        $("#create-game-home, #create-game-away").append(
            `<option>${team}</option`);
    });
}

function manageGamePage(game_id) {
    $("#verify-delete-section").hide();

    getGame(game_id).then(function (game) {
        $("#game-manage-home-score").val(game.result.home);
        $("#game-manage-away-score").val(game.result.away);
        if (game.result.home == '-')
            $("#game-manage-verify-section").show();
        else
            $("#game-manage-verify-section").hide();
    });

    $("#game-manage-score-btn").click(function () {
        $.when(getWalletAddress(), getGame(game_id))
            .then(function (walletAddress, game) {
            // make sure game is scorable
            var now = new Date.getTime() / 1000;
            if (game.locktime > now)
                return false;

            var homeScore = parseInt($("#game-manage-home-score").val());
            var awayScore = parseInt($("#game-manage-away-score").val());
            if (homeScore == '' || awayScore == '')
                return false;
            contract.setGameResult(game_id, homeScore, awayScore,
                { from: walletAddress, gas: 400000 }, function (err, tx_hash) {
                    console.log(err, tx_hash);
                });
        });
    });

    $("#initial-delete-btn").click(function () {
        $("#verify-delete-section").show();
    });

    $("#permanent-delete").click(function () {
        if ($("#verify-delete-text").val() != "DELETE")
            return false;
        contract.deleteGame(game_id, { from: walletAddress, gas: 600000 }, 
            function (err, tx_hash) {
                console.log(err, tx_hash);
            });
    });
}
