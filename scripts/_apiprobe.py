import urllib.request, json, sys
KEY = "ebbd6b842e6d5bcc1d473533ba53b2d3"
def get(path):
    req = urllib.request.Request("https://v3.football.api-sports.io" + path,
                                 headers={"x-apisports-key": KEY})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)
st = get("/status")
resp = st.get("response", {})
acc = resp.get("account", {}); sub = resp.get("subscription", {}); req = resp.get("requests", {})
print("OK-STATUS")
print("account:", acc.get("firstname"), acc.get("lastname"), "|", acc.get("email"))
print("plan:", sub.get("plan"), "| active:", sub.get("active"), "| end:", sub.get("end"))
print("requests_today:", req.get("current"), "/", req.get("limit_day"))
print("status_errors:", st.get("errors"))
