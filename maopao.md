# 冒泡排序 (Bubble Sort)

## 算法简介

冒泡排序是一种简单的排序算法。它重复地走访过要排序的数列，一次比较两个元素，如果它们的顺序错误就把它们交换过来。走访数列的工作是重复地进行直到没有再需要交换，也就是说该数列已经排序完成。

这个算法的名字由来是因为越小的元素会经由交换慢慢"浮"到数列的顶端，就像水中的气泡一样上浮。

## 算法步骤

1. 比较相邻的元素。如果第一个比第二个大，就交换它们两个。
2. 对每一对相邻元素做同样的工作，从开始第一对到结尾的最后一对。这步做完后，最后的元素会是最大的数。
3. 针对所有的元素重复以上的步骤，除了最后一个。
4. 持续每次对越来越少的元素重复上面的步骤，直到没有任何一对数字需要比较。

## 时间复杂度

| 情况 | 时间复杂度 |
|------|-----------|
| 最好情况 | O(n) |
| 平均情况 | O(n²) |
| 最坏情况 | O(n²) |
| 空间复杂度 | O(1) |

## 动图演示

```
初始数组: [5, 3, 8, 6, 4]

第一轮:
[5, 3, 8, 6, 4] → 5>3 交换 → [3, 5, 8, 6, 4]
[3, 5, 8, 6, 4] → 5<8 不变 → [3, 5, 8, 6, 4]
[3, 5, 8, 6, 4] → 8>6 交换 → [3, 5, 6, 8, 4]
[3, 5, 6, 8, 4] → 8>4 交换 → [3, 5, 6, 4, 8]  ← 8 已归位

第二轮:
[3, 5, 6, 4, 8] → 3<5 不变 → [3, 5, 6, 4, 8]
[3, 5, 6, 4, 8] → 5<6 不变 → [3, 5, 6, 4, 8]
[3, 5, 6, 4, 8] → 6>4 交换 → [3, 5, 4, 6, 8]  ← 6 已归位

第三轮:
[3, 5, 4, 6, 8] → 3<5 不变 → [3, 5, 4, 6, 8]
[3, 5, 4, 6, 8] → 5>4 交换 → [3, 4, 5, 6, 8]  ← 5 已归位

第四轮:
[3, 4, 5, 6, 8] → 3<4 不变 → [3, 4, 5, 6, 8]  ← 排序完成
```

---

## 代码实现

### JavaScript 版本

```javascript
/**
 * 冒泡排序
 * @param {number[]} arr - 待排序的数组
 * @returns {number[]} 排序后的数组
 */
function bubbleSort(arr) {
    const len = arr.length;
    
    // 外层循环：控制比较的轮数
    for (let i = 0; i < len - 1; i++) {
        let swapped = false; // 优化：标记本轮是否有交换
        
        // 内层循环：进行相邻元素比较
        // len - 1 - i：每轮结束后最后 i 个元素已排好
        for (let j = 0; j < len - 1 - i; j++) {
            if (arr[j] > arr[j + 1]) {
                // 交换相邻元素
                [arr[j], arr[j + 1]] = [arr[j + 1], arr[j]];
                swapped = true;
            }
        }
        
        // 如果本轮没有发生交换，说明已经有序，提前结束
        if (!swapped) break;
    }
    
    return arr;
}

// 测试
const arr = [64, 34, 25, 12, 22, 11, 90];
console.log("排序前:", arr);
console.log("排序后:", bubbleSort([...arr]));
```

### Python 版本

```python
def bubble_sort(arr):
    """
    冒泡排序
    :param arr: 待排序的列表
    :return: 排序后的列表
    """
    n = len(arr)
    
    # 外层循环：控制比较的轮数
    for i in range(n - 1):
        swapped = False  # 优化：标记本轮是否有交换
        
        # 内层循环：进行相邻元素比较
        for j in range(n - 1 - i):
            if arr[j] > arr[j + 1]:
                # 交换相邻元素
                arr[j], arr[j + 1] = arr[j + 1], arr[j]
                swapped = True
        
        # 如果本轮没有发生交换，说明已经有序，提前结束
        if not swapped:
            break
    
    return arr


# 测试
if __name__ == "__main__":
    arr = [64, 34, 25, 12, 22, 11, 90]
    print("排序前:", arr)
    print("排序后:", bubble_sort(arr.copy()))
```

### Java 版本

```java
public class BubbleSort {
    
    /**
     * 冒泡排序
     * @param arr 待排序的数组
     */
    public static void bubbleSort(int[] arr) {
        int n = arr.length;
        
        // 外层循环：控制比较的轮数
        for (int i = 0; i < n - 1; i++) {
            boolean swapped = false; // 优化：标记本轮是否有交换
            
            // 内层循环：进行相邻元素比较
            for (int j = 0; j < n - 1 - i; j++) {
                if (arr[j] > arr[j + 1]) {
                    // 交换相邻元素
                    int temp = arr[j];
                    arr[j] = arr[j + 1];
                    arr[j + 1] = temp;
                    swapped = true;
                }
            }
            
            // 如果本轮没有发生交换，说明已经有序，提前结束
            if (!swapped) break;
        }
    }
    
    // 测试
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

/**
 * 冒泡排序
 * @param arr 待排序的数组（引用传递，原地排序）
 */
void bubbleSort(vector<int>& arr) {
    int n = arr.size();
    
    // 外层循环：控制比较的轮数
    for (int i = 0; i < n - 1; i++) {
        bool swapped = false; // 优化：标记本轮是否有交换
        
        // 内层循环：进行相邻元素比较
        for (int j = 0; j < n - 1 - i; j++) {
            if (arr[j] > arr[j + 1]) {
                // 交换相邻元素
                swap(arr[j], arr[j + 1]);
                swapped = true;
            }
        }
        
        // 如果本轮没有发生交换，说明已经有序，提前结束
        if (!swapped) break;
    }
}

// 测试
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

### C 语言版本

```c
#include <stdio.h>
#include <stdbool.h>

/**
 * 冒泡排序
 * @param arr 待排序的数组
 * @param n 数组长度
 */
void bubbleSort(int arr[], int n) {
    // 外层循环：控制比较的轮数
    for (int i = 0; i < n - 1; i++) {
        bool swapped = false; // 优化：标记本轮是否有交换
        
        // 内层循环：进行相邻元素比较
        for (int j = 0; j < n - 1 - i; j++) {
            if (arr[j] > arr[j + 1]) {
                // 交换相邻元素
                int temp = arr[j];
                arr[j] = arr[j + 1];
                arr[j + 1] = temp;
                swapped = true;
            }
        }
        
        // 如果本轮没有发生交换，说明已经有序，提前结束
        if (!swapped) break;
    }
}

// 打印数组
void printArray(int arr[], int n) {
    for (int i = 0; i < n; i++) {
        printf("%d ", arr[i]);
    }
    printf("\n");
}

// 测试
int main() {
    int arr[] = {64, 34, 25, 12, 22, 11, 90};
    int n = sizeof(arr) / sizeof(arr[0]);
    
    printf("排序前: ");
    printArray(arr, n);
    
    bubbleSort(arr, n);
    
    printf("排序后: ");
    printArray(arr, n);
    
    return 0;
}
```

---

## 算法特点

### 优点
- 实现简单，容易理解
- 属于**稳定排序**（相等元素的相对顺序不变）
- 空间复杂度低，只需要 O(1) 的额外空间

### 缺点
- 时间复杂度较高，为 O(n²)，不适合大规模数据
- 即使输入数据已经有序，基础版本仍需完整遍历

---

## 优化策略

1. **提前终止**：如果某一轮没有发生交换，说明数组已有序，可直接结束。
2. **记录最后交换位置**：记录每轮最后一次交换的位置，下一轮只需比较到该位置。
3. **双向冒泡（鸡尾酒排序）**：同时从两端进行冒泡，在某些情况下可以减少排序轮数。

---

> 冒泡排序虽然效率不高，但作为入门级排序算法，帮助理解排序的基本思想和算法复杂度概念，仍然是学习算法的必修课。
