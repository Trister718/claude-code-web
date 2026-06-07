def bubble_sort(arr):
    """
    冒泡排序（升序）
    
    思想：
    - 重复遍历数组，依次比较相邻的两个元素
    - 如果前一个比后一个大，就交换位置
    - 每一轮遍历会把当前未排序部分的最大值"冒泡"到最后
    - 已经排好的部分不再参与比较
    
    时间复杂度：O(n²)  最好 O(n)（优化后）
    空间复杂度：O(1)
    稳定性：稳定
    """
    n = len(arr)
    
    # 一共进行 n-1 轮
    for i in range(n - 1):
        swapped = False  # 优化：检测本轮是否有交换
        
        # 每轮比较到倒数第 i+1 个元素（后面 i 个已排好）
        for j in range(n - 1 - i):
            if arr[j] > arr[j + 1]:
                arr[j], arr[j + 1] = arr[j + 1], arr[j]
                swapped = True
        
        # 如果本轮没有发生交换，说明已经有序，提前结束
        if not swapped:
            break
    
    return arr


if __name__ == "__main__":
    # 测试
    test_cases = [
        [64, 34, 25, 12, 22, 11, 90],
        [5, 1, 4, 2, 8],
        [1, 2, 3, 4, 5],          # 已排序
        [5, 4, 3, 2, 1],           # 逆序
        [],                         # 空数组
        [42],                       # 单元素
    ]
    
    for arr in test_cases:
        original = arr.copy()
        sorted_arr = bubble_sort(arr)
        print(f"{original} -> {sorted_arr}")
