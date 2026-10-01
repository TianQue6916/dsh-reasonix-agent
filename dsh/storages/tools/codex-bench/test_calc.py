import pytest
from calc import add, div, mean

def test_add(): assert add(2, 3) == 5
def test_div_by_zero():
    with pytest.raises(ZeroDivisionError):
        div(1, 0)
def test_mean(): assert mean([1, 2, 3]) == 2
