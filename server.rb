require 'xmlrpc/httpserver'
require 'thread'

$mtx = Mutex.new
$cv = ConditionVariable.new
$page = File.read("page.html")
$script = File.read("app.js")
$chartjs = File.read("Chart.min.js");
spin = true

class BurndownHandler
    def new()
    end

    def request_handler(request, response)
        $page = File.read("page.html")
        $script = File.read("app.js")
        if request.path == '/burndown.js' then
            response.body = $script
            response.header["Content-Type"] = "text/javascript"
        elsif request.path == '/chart.js' then
            response.body = $chartjs
            response.header["Content-Type"] = "text/javascript"
        elsif request.path == '/style.css' then
            response.body = File.read("style.css")
            response.header["Content-Type"] = "text/css" 
        else
            response.body = $page
            response.header["Content-Type"] = "text/html"
        end
    end

    def ip_auth_handler(io)
        return true
    end
end

th = Thread.new do
    $mtx.synchronize {
        $cv.wait($mtx)
    }
end

th.run

http = HttpServer.new(BurndownHandler.new, 8080)
http.start

th.join
http.stop
