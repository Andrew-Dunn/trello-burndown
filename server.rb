require 'xmlrpc/httpserver'
require 'thread'

$mtx = Mutex.new
$cv = ConditionVariable.new
$page = File.read("index.html")
$script = File.read("burndown.js")
spin = true

class BurndownHandler
    def new()
    end

    def request_handler(request, response)
        $page = File.read("index.html")
        $script = File.read("burndown.js")
        if request.path == '/burndown.js' then
            response.body = $script
            response.header["Content-Type"] = "text/javascript"
        elsif request.path == '/style.css' then
            response.body = File.read("style.css")
            response.header["Content-Type"] = "text/css"
        elsif request.path == '/logo.png' then
            response.body = File.read("logo.png")
            response.header["Content-Type"] = "image/png"
        elsif request.path == '/logo@2x.png' then
            response.body = File.read("logo@2x.png")
            response.header["Content-Type"] = "image/png"
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

http = HttpServer.new(BurndownHandler.new, 8080, "0.0.0.0")
http.start

th.join
http.stop
