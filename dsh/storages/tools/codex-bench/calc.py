def add(a, b):
    return a + b

def div(a, b):
    return a / b          # BUG: 未处理 b == 0

def mean(xs):
    total = 0
    for x in xs:          # BUG: 忘了 total += x
        pass
    return total / len(xs)
