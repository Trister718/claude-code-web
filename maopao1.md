# 冒泡排序 (Bubble Sort)

## 算法原理

冒泡排序是一种简单的排序算法，它重复地遍历要排序的列表，一次比较两个相邻的元素，如果它们的顺序错误就交换它们的位置。这个过程重复进行，直到没有再需要交换的元素为止。

每一轮遍历会将当前未排序部分的最大（或最小）元素"冒泡"到正确的位置。

## 时间复杂度

| 情况 | 时间复杂度 |
|------|-----------|
| 最优（已排序） | O(n) |
| 平均 | O(n²) |
| 最坏（逆序） | O(n²) |

- **空间复杂度**：O(1)（原地排序）

## 算法步骤

1. 比较相邻的两个元素。如果第一个比第二个大，就交换它们。
2. 对每一对相邻元素做同样的工作，从开始第一对到结尾的最后一对。这样一趟下来，最后的元素会是最大的数。
3. 针对所有的元素重复以上步骤，除了最后一个（因为它已经排好）。
4. 持续每次对越来越少的元素重复上述步骤，直到没有任何一对数字需要比较。

## 代码实现

### Python 版本

```python
def bubble_sort(arr):
    """
    冒泡排序（优化版）
    
    Args:
        arr: 待排序的列表
        
    Returns:
        排序后的列表（原地排序）
    """
    n = len(arr)
    
    # 外层循环：需要 n-1 轮
    for i in range(n - 1):
        # 优化：如果某一轮没有发生交换，说明已经有序，提前结束
        swapped = False
        
        # 内层循环：每轮比较相邻元素
        # 每轮结束后，最后 i 个元素已经排好
        for j in range(n - 1 - i):
            if arr[j] > arr[j + 1]:
                # 交换
                arr[j], arr[j + 1] = arr[j + 1], arr[j]
                swapped = True
        
        # 如果没有交换，说明已经有序
        if not swapped:
            break
    
    return arr


# 示例用法
if __name__ == "__main__":
    test_arr = [64, 34, 25, 12, 22, 11, 90]
    print(f"排序前: {test_arr}")
    bubble_sort(test_arr)
    print(f"排序后: {test_arr}")
```

**输出：**
```
排序前: [64, 34, 25, 12, 22, 11, 90]
排序后: [11, 12, 22, 25, 34, 64, 90]
```

### JavaScript 版本

```javascript
function bubbleSort(arr) {
    const n = arr.length;
    
    for (let i = 0; i < n - 1; i++) {
        let swapped = false;
        
        for (let j = 0; j < n - 1 - i; j++) {
            if (arr[j] > arr[j + 1]) {
                // 交换
                [arr[j], arr[j + 1]] = [arr[j + 1], arr[j]];
                swapped = true;
            }
        }
        
        if (!swapped) break;
    }
    
    return arr;
}

// 示例
const arr = [64, 34, 25, 12, 22, 11, 90];
console.log("排序前:", arr);
bubbleSort(arr);
console.log("排序后:", arr);
```

### Java 版本

```java
public class BubbleSort {
    public static void bubbleSort(int[] arr) {
        int n = arr.length;
        
        for (int i = 0; i < n - 1; i++) {
            boolean swapped = false;
            
            for (int j = 0; j < n - 1 - i; j++) {
                if (arr[j] > arr[j + 1]) {
                    // 交换
                    int temp = arr[j];
                    arr[j] = arr[j + 1];
                    arr[j + 1] = temp;
                    swapped = true;
                }
            }
            
            if (!swapped) break;
        }
    }
    
    public static void main(String[] args) {
        int[] arr = {64, 34, 25, 12, 22, 11, 90};
        System.out.println("排序前: " + java.util.Arrays.toString(arr));
        bubbleSort(arr);
        System.out.println("排序后: " + java.util.Arrays.toString(arr));
    }
}
```

### C++ 版本

```cpp
#include <iostream>
#include <vector>
using namespace std;

void bubbleSort(vector<int>& arr) {
    int n = arr.size();
    
    for (int i = 0; i < n - 1; i++) {
        bool swapped = false;
        
        for (int j = 0; j < n - 1 - i; j++) {
            if (arr[j] > arr[j + 1]) {
                // 交换
                swap(arr[j], arr[j + 1]);
                swapped = true;
            }
        }
        
        if (!swapped) break;
    }
}

int main() {
    vector<int> arr = {64, 34, 25, 12, 22, 11, 90};
    
    cout << "排序前: ";
    for (int num : arr) cout << num << " ";
    cout << endl;
    
    bubbleSort(arr);
    
    cout << "排序后: ";
    for (int num : arr) cout << num << " ";
    cout << endl;
    
    return 0;
}
```

## 图解过程

以数组 `[5, 3, 8, 6, 2]` 为例：

```
初始状态: [5, 3, 8, 6, 2]

第1轮:
  比较 5,3 → 交换 → [3, 5, 8, 6, 2]
  比较 5,8 → 不变 → [3, 5, 8, 6, 2]
  比较 8,6 → 交换 → [3, 5, 6, 8, 2]
  比较 8,2 → 交换 → [3, 5, 6, 2, 8]
  结果: 8 冒泡到末尾 ✓

第2轮:
  比较 3,5 → 不变 → [3, 5, 6, 2, 8]
  比较 5,6 → 不变 → [3, 5, 6, 2, 8]
  比较 6,2 → 交换 → [3, 5, 2, 6, 8]
  结果: 6 冒泡到正确位置 ✓

第3轮:
  比较 3,5 → 不变 → [3, 5, 2, 6, 8]
  比较 5,2 → 交换 → [3, 2, 5, 6, 8]
  结果: 5 冒泡到正确位置 ✓

第4轮:
  比较 3,2 → 交换 → [2, 3, 5, 6, 8]
  结果: 全部有序 ✓
```

## 特点总结

| 特点 | 描述 |
|------|------|
| **稳定性** | ✅ 稳定（相等元素不交换） |
| **原地排序** | ✅ 是（仅用常量级额外空间） |
| **适应性** | ✅ 对部分有序数据效率更高 |
| **适合场景** | 小规模数据或教学演示 |
| **不适合** | 大规模数据（优先选择快速排序、归并排序等） |
