google.load("visualization", "1", {packages:["corechart"]});
google.setOnLoadCallback(function() {

var chart;
var chartOpts = null;
// Credit to Douglas Crockford for this bind method
if (!Function.prototype.bind) {
    Function.prototype.bind = function (oThis) {
        if (typeof this !== "function") {
            // closest thing possible to the ECMAScript 5 internal IsCallable function
            throw new TypeError ("Function.prototype.bind - what is trying to be bound is not callable");
        }

        var aArgs = Array.prototype.slice.call (arguments, 1),
                fToBind = this,
                fNOP = function () {
                },
                fBound = function () {
                    return fToBind.apply (this instanceof fNOP && oThis
                            ? this
                            : oThis,
                            aArgs.concat (Array.prototype.slice.call (arguments)));
                };

        fNOP.prototype = this.prototype;
        fBound.prototype = new fNOP ();

        return fBound;
    };
}

var processCurves = function(curves) {
    var sortCurve = function (curve1, curve2) {
        return curve1.date - curve2.date;
    }

    var output = [];

    for (var i = 0; i < curves.length; i++)
    {
        var curve = curves[i].sort(sortCurve);
        for (var j = 0; j < curve.length; j++) {
            if (curve[j].left < 0) {
                curve[j].left = curve[j - 1].left + curve[j].left;
            }
        }

        output.push(curve);
    }
    return output;
}

var interpolateProgress = function (curve, date) {
    if (date <= curve[0].date) {
        return curve[0].left;
    }

    if (date >= curve[curve.length - 1].date) {
        return curve[curve.length -1].left;
    }

    for (var i = 0; i < curve.length - 1; i++) {
        if (date >= curve[i].date && date <= curve[i + 1].date) {
            var segment = +(curve[i + 1].date) - +(curve[i].date);
            var diff = +date - (+curve[i].date);
            var delta = diff/segment;
            return delta * (curve[i + 1].left - curve[i].left) + curve[i].left;
        }
    }
}

var generateChart = function(info, due) {
    //$("<pre>").text(JSON.stringify(info, undefined, 2)).appendTo("#main");
    var hours = 0;
    var start = null;
    var curves = [];

    for (var i = 0; i < info.length; i++) {
        var card = info[i].card;
        var actions = info[i].actions;

        var hasEstimate = card.desc.indexOf("Estimated Time: ");
        var taskLen = 0;
        if (hasEstimate >= 0)
        {
            taskLen = parseInt(card.desc.substring(hasEstimate + 16));
            hours += taskLen;
        }

        curves[i] = [];

        uncomplete = {};

        for (var j = 0; j < info[i].actions.length; j++) {
            var action = info[i].actions[j];
            var date = new Date(action.date);

            if (start === null) {
                start = date;
            } else if (start > date) {
                start = date;
            }

            if (action.type == "createCard") {
                curves[i].push({"date": date, "left": taskLen});
            } else if (action.type == "updateCard") {
                var left = taskLen;
                if (action.data.listAfter.name == "Done") {
                    left = 0;
                }
                curves[i].push({"date": date, "left": left});
            } else if (action.type == "updateCheckItemStateOnCard") {
                if (action.data.checkItem.state == "incomplete")
                {
                    uncomplete[action.data.checkItem.id] = true;
                }
                else
                {
                    if (uncomplete[action.data.checkItem.id] !== true)
                    {
                        var name = action.data.checkItem.name;
                        var rep = name.replace(/.*\((\d) hours?\).*/i, "$1");
                        if (name != rep) {
                            curves[i].push({"date": date, "left": -parseInt(rep)});
                        }
                    }
                    else
                    {
                        uncomplete[action.data.checkItem.id] = null;
                    }
                }
            }
        }
    }

    curves = processCurves(curves);

    var mainElem = $("#main");

    //var $canvas = $("<canvas>").attr("width", mainElem.width()).attr("height", mainElem.height()).appendTo("#main");

    //var context = $canvas.get(0).getContext("2d");

    var granularity = 1000.0;
    var labelCount = 14;
    var labels = [];
    var delta = (due - start) / granularity;
    var burndown;
    var constant;
    var now = new Date();

    var data_array = [];
    data_array.push(['Remaining Effort (Hours)',
                     'Actual Remaining Effort',
                     'Ideal Remaining Effort']);

    for (var i = 0; i < granularity; i++) {
        labels[i] = "";
        constant = hours * ((granularity -1 - i) / (granularity-1));
        var stamp = new Date(+start + (delta * i));

        burndown = null;
        if (stamp < now) {
            burndown = 0;
            for (var j = 0; j < curves.length; j++) {
                burndown += interpolateProgress(curves[j], stamp)
            }
        }
        data_array.push([(delta * i) / (1000 * 3600 * 24), burndown, constant]);
    }

    var data = google.visualization.arrayToDataTable(data_array);
    var hours_formatter = new google.visualization.NumberFormat({pattern:'#.# hours'});
    var days_formatter = new google.visualization.NumberFormat({pattern:'# days'});
    hours_formatter.format(data, 1);
    hours_formatter.format(data, 2);
    days_formatter.format(data, 0);

    var options = {
      title: 'Burndown Chart for Sprint',
      hAxis: {
          title: 'Sprint timeline (days)',
          format:'# days'
      },
      vAxis: {
          title: 'Remaining Effort (hours)',
          maxValue: Math.ceil((due - start) / (1000 * 3600 * 24))
      }
    };

    chart = new google.visualization.LineChart(document.getElementById('main'));
    chartOpts = {"data": data, "options": options};
    chart.draw(data, options);
}

$( window ).resize(function() {
    if (chartOpts !== null) {
        chart.draw(chartOpts.data, chartOpts.options);
    }
});

var processCards = function (cards) {
    var due = null;
$("#main").empty();
    // Calculate Due Date.
    var processed = cards.length;
    var info = [];
    for (var i = 0; i < cards.length; i++)
    {
        var card = cards[i];
        var context = {'index': i, 'card': card};
        info[i] = null;

        if (card.due != null) {
            var date = new Date(card.due);
            if (due == null) {
                due = date;
            } else if (date > due) {
                due = date;
            }
        }

        Trello.get("cards/" + card.id + "/actions", {
            filter: "createCard,updateCard:idList,updateChecklist,updateCheckItemStateOnCard"
        }, (function(actions) {
            processed -= 1;
            info[this.index] = {"card": this.card, "actions": actions};
            if (processed == 0) {
                generateChart(info, due);
            }
        }).bind(context));
    }
}

var loadBoard = function (board) {
    return function () {

        Trello.get("boards/" + board.id + "/cards", function(cards) {
            processCards(cards);
        });
    }
}

var loadBoardList = function () {
    $ul = $(".nav.navbar-nav");
    var orgs = {};
    Trello.get("members/me/organizations", function(organizations) {
        var li;
        var ul;
        for (var i = 0; i < organizations.length; i++)
        {
            var org = organizations[i];
            li = $("<li>");
            ul = $("<ul>").addClass("dropdown-menu");
            li.html('<a href="#" class="dropdown-toggle" data-toggle="dropdown">' + org.displayName + '<b class="caret"></b></a>').appendTo($ul);
            ul.appendTo(li);
            orgs[org.id] = ul;
        }

        li = $("<li>");
        ul = $("<ul>").addClass("dropdown-menu");
        li.html('<a href="#" class="dropdown-toggle" data-toggle="dropdown">Personal<b class="caret"></b></a>').appendTo($ul);
        ul.appendTo(li);

        Trello.get("members/me/boards", {
            filter: "open"
        },function(boards) {
            for (var i = 0; i < boards.length; i++)
            {
                var board = boards[i];
                li = $("<li>");

                var list = ul;
                var a = $("<a>");
                a.attr("href", "#board_" + board.id);
                a.text(board.name);
                a.appendTo(li);
                a.click(loadBoard(board));
                if (board.idOrganization != null) {
                    list = orgs[board.idOrganization];
                }
                li.appendTo(list);
            }
        });
    });
}

var onAuthorize = function() {
    updateLoggedIn();
    $("#control").empty();

    Trello.members.get("me", function(member){
        $("#fullName").text(member.fullName);

        var $cards = $("<div>")
            .text("Loading Cards...")
            .appendTo("#control");

        // Output a list of all of the cards that the member
        // is assigned to
        //Trello.get("members/me/idOrganizations")
        /*Trello.get("members/me/organizations", function(cards) {
            $cards.empty();
            $("<pre>").text(JSON.stringify(cards, undefined, 2)).appendTo($cards);
        */
        loadBoardList();
    });

};

var updateLoggedIn = function() {
    var isLoggedIn = Trello.authorized();
    $('a[href="#logout"]').toggle(isLoggedIn);
    $('a[href="#login"]').toggle(!isLoggedIn);
};

var logout = function() {
    Trello.deauthorize();
    updateLoggedIn();
};

Trello.authorize({
    interactive:false,
    success: onAuthorize,
    name: "Trello Burndown",
    expiration: "never"
});

$('a[href="#login"]')
.click(function(){
    Trello.authorize({
        type: "popup",
        success: onAuthorize,
        name: "Trello Burndown",
        expiration: "never"
    })
});

$('a[href="#logout"]').click(logout);
});
