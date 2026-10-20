"""Author a review-only decomposition of the verified CCF C++ syllabus.

CCF clauses are evidence; atom splits, prerequisite edges and instructional
criteria below are preparation proposals, not official certification rules.
"""
from __future__ import annotations

import json
from pathlib import Path

from capture_sources import ROOT, OUT, write_json
from build_catalog import syllabus_clauses

# level | slug | name | official clauses | instructional prerequisite slugs |
# math prerequisites | observable criterion | common error to investigate | literal search terms
DEFINITIONS = """
1|computer|计算机组成、操作系统与历史|1||输入和输出的生活经验|区分CPU、内存、输入输出设备并说明一次信息流动|把存储设备、输入设备和输出设备混为一谈|CPU,内存,操作系统,计算机,输入设备,输出设备
1|ide|编辑、编译、运行与调试环境|2|1.computer||独立创建保存源文件并区分编译错误和运行结果|将编辑、编译、运行或解释视为同一步|IDE,集成开发环境,编译,Dev
1|io|输入输出与赋值|3|1.ide,1.variables||按指定次序读取输入并精确输出所需格式|把读取输入与输出提示文字混淆|cin,cout,scanf,printf
1|identifiers|标识符、关键字、常量和表达式|4|||能判断名称是否合法并区分关键字、变量名和表达式|把cout当语言关键字或让名称以数字开头|标识符,关键字,常量,表达式
1|variables|变量定义、初始化与赋值|5|1.identifiers|等号与赋值的区别|用状态表说明每次赋值后变量的值|把赋值当等式或使用未初始化变量|变量,初始化,赋值
1|types|整型、浮点型、字符型和布尔型|9|1.variables|整数与小数|为数据选择int、long long、double、char、bool并解释范围|把类型、取值和显示格式混淆|int,long long,double,float,char,bool,数据类型
1|arithmetic|算术运算、优先级与自增自减|5,6|1.variables,1.types|四则运算与运算顺序|逐步跟踪带括号、优先级和自增的表达式|忽略优先级或混淆自增前后使用的值|算术,优先级,自增,自减,++ ,-- ,乘,除
1|division|整除与求余|6|1.arithmetic|带余除法和奇偶|能解释商与余数并独立处理数位或奇偶任务|把整数除法结果当作小数或漏掉余数条件|求余,整除,取模,%,余数
1|relations|关系运算与相等比较|8|1.variables|大小关系|用边界值判断六种比较表达式真假|混淆=与==或漏掉等于边界|大于,小于,==,!=,>=,<=
1|logic|逻辑与、或、非|7|1.relations|且、或、非的语言含义|把复合条件翻译为逻辑表达式并举反例|把或者理解为必须同时满足|&&,逻辑,非
1|sequence|顺序结构与程序状态跟踪|10|1.io,1.arithmetic||按执行顺序用状态表说明每一步输入、计算和输出|用最后结果倒推并跳过中间状态|顺序结构,顺序执行
1|branch|if、switch 与条件选择|11|1.logic,1.sequence||独立编写含互斥条件的分支并验证边界|多个if与if-else链的语义混淆|if,switch,else,三目,条件
1|loop|for、while、do-while|12|1.branch|有限次重复、数列和计数|说明初值、条件、更新及终止原因并独立实现累加|漏一次、重复一次或循环条件不变|for,while,循环
1|loop-control|break 与 continue|12|1.loop||用同一例子解释结束整个循环与跳过本次迭代的区别|把continue当作退出循环|break,continue
1|debug|注释、测试与基础调试|13|1.sequence||用正常和边界输入复现问题并解释修改原因|只试一个样例或仅改到输出碰巧一致|注释,调试,错误
2|memory|RAM、ROM 与 Cache|1|1.computer|存储容量单位|说明三类存储的作用与区别|认为所有存储都断电保留数据|RAM,ROM,Cache,存储器
2|network|网络分类、分层、协议及 IP|2|1.computer|二进制与地址的直观认识|区分WAN、MAN、LAN及TCP/IP和OSI层级并解释地址作用|混淆网络范围、协议层和地址|TCP,UDP,OSI,IP,局域网,广域网,网络
2|languages|程序设计语言分类|3|1.ide||区分机器语言、汇编语言和高级语言|认为C++源文件可不经转换直接被CPU执行|机器语言,汇编,高级语言,程序设计语言
2|flowchart|流程图符号与控制流程|4|1.branch,1.loop||按流程图逐步跟踪并能画出分支和循环|忽略条件出口或把图形位置当执行顺序|流程图
2|ascii|ASCII 及字符转换|5|1.types|整数差和顺序|利用0、A、a的编码关系处理字符转换|混淆字符0与整数0|ASCII,字符,大小写,'A','a','0'
2|conversion|隐式与显式类型转换|6|1.types,1.division|整数与小数运算|解释先计算后转换与先转换后计算的区别|在整数除法之后转换却期望找回小数|类型转换,强制转换,隐式转换,(double),(int)
2|branches|多层分支|7|1.branch||独立写出嵌套条件并解释else的绑定关系|因缩进误判else配对或漏条件|if,else,switch,分支
2|nested-loops|多层循环与图形输出|8|1.loop|行列、数位和有序枚举|将行号与列号对应到两层循环并保持状态更新正确|内层计数不重置或把行列关系写反|for,while,嵌套,三角形,图案
2|math-functions|abs、sqrt、max、min|9|1.types,2.conversion|绝对值、平方与平方根的直观概念|正确选择函数并解释参数范围和结果类型|忽略平方根定义域或浮点误差|abs,sqrt,max,min,平方根,绝对值
2|random|rand 与 srand|9|1.types,1.division||解释伪随机序列与种子并理解简单范围映射|认为相同种子一定产生不同序列|rand,srand,随机
3|number-code|原码、反码与补码|1|2.ascii|符号、二进制位和定长表示|在指定位宽下解释正负数编码|忽略位宽或将数学负号当符号位本身|原码,反码,补码
3|base|二、八、十、十六进制转换|2|1.division|位值与乘方|解释按权展开及除基取余并能双向检验|余数顺序倒置或混淆数码和进制|进制,二进制,八进制,十六进制
3|bitwise|按位与、或、非和异或|3|3.number-code,3.base||逐位计算并与逻辑运算区分|把按位运算与逻辑运算混淆|位运算,异或,按位,&,^,~
3|shift|左右移与位宽边界|3|3.bitwise|二的幂|在明确类型和有效移位范围内说明移位结果|把所有左移都当安全乘二而忽略标准边界|左移,右移,<<,>>
3|algorithm-description|自然语言、流程图与伪代码|4|2.flowchart||写出有输入、输出、有限步骤的解题过程|只描述目标而不给出可执行步骤|伪代码,算法,流程图
3|array|定长一维数组与遍历|5|1.types,1.loop|编号与下标|正确使用下标并说明数组范围和初始化|从1数到n却访问长度n的a[n]|数组,下标,array,[]
3|strings|字符串遍历、查找、分割和替换|6|2.ascii,3.array||区分读入单词与整行并正确处理空串和空格|cin读入丢失空格或把子串与子序列混淆|string,字符串,find,substr,getline,replace
3|enumeration|枚举候选与条件检查|7|2.nested-loops,3.algorithm-description|有限分类与不重不漏计数|给出候选范围并说明枚举不重不漏|忽略零值候选或重复计算对称方案|枚举,所有可能,方案
3|simulation|按规则维护状态的模拟|7,8|3.algorithm-description,3.array||将题目每步规则落实为状态更新并检查先后顺序|就地更新让后续步骤读取了错误状态|模拟,规则,依次,操作
4|pointer|指针定义、赋值与解引用|1|1.types,1.variables||画出变量、地址和指针关系并解释解引用|把指针值与所指对象值混淆|指针,解引用,int *,nullptr
4|matrix|二维与多维定长数组|2|3.array,2.nested-loops|行列坐标|遍历矩阵并正确转换行列和邻接位置|颠倒行列或越过边界|二维,多维,矩阵,网格
4|struct|结构体及结构体数组、指针和参数|2|3.array,4.pointer||将关联字段组织为记录并完成按字段访问|排序一个字段后破坏记录对应关系|struct,结构体
4|function|函数声明、定义、调用及形实参|3|1.sequence||将任务拆成函数并解释输入、返回值和调用过程|把函数声明当执行或混淆形参和实参|函数,返回值,形参,实参,return
4|scope|全局和局部作用域|4|4.function||用嵌套同名变量说明可见性和生命周期|用变量名相同推断它们是同一对象|作用域,全局,局部
4|parameter-value|函数值传递|5|4.function||说明参数副本修改为何不改变调用者变量|以为所有形参修改都会传回|值传递,参数
4|parameter-reference|引用传递与指针传递|5|4.function,4.pointer,4.parameter-value||解释实参如何被函数修改并避免悬空引用|把地址传递误解为复制整个数组|引用,指针传递,引用传递
4|recurrence|递推状态、边界与转移|6|3.array,1.loop|数列规律和分类计数|从最后一步分类推导递推式并给出初始状态|只背斐波那契或遗漏n为0、1的边界|递推,台阶,斐波那契,汉诺塔
4|sort-concepts|排序概念、稳定性与内外排序|7|3.array||用带相同关键字的记录解释排序稳定性|把数值有序等同于记录相对次序稳定|排序,稳定性,稳定,内排序,外排序
4|bubble|冒泡排序|8|4.sort-concepts,2.nested-loops||说明一轮交换后的已确定位置并独立实现|内层终点错误或比较方向反了|冒泡,bubble
4|insertion|插入排序|8|4.sort-concepts,2.nested-loops||维护有序前缀并正确移动元素|移动时覆盖待插入值|插入排序,insertion
4|selection|选择排序|8|4.sort-concepts,2.nested-loops||每轮选出剩余最小元素并解释稳定性|把找到最小值与交换的位置混淆|选择排序,selection
4|complexity|简单时间和空间效率估算|9|2.nested-loops|乘法、乘方和增长比较|根据实际循环次数区分多项式和指数增长|看见两层循环就断言一定是n平方|复杂度,效率,O(,指数,空间
4|file|文件重定向与读写|10|1.io||区分标准输入输出重定向与文件流读写|文件打开失败后仍认为读入有效|freopen,ifstream,ofstream,文件,重定向
4|exception|异常处理基础|11|4.function||解释try、throw、catch的基本控制流|以为catch能处理全部逻辑错误|try,throw,catch,异常
5|number-theory|素数、合数、约数、倍数与奇偶|1|1.division,3.enumeration|整除、因数和倍数|判断基本数论条件并处理1等特殊值|将1当素数或漏掉平方根因数|素数,质数,合数,约数,因数,倍数,奇偶
5|gcd-lcm|最大公约数与最小公倍数|1|5.number-theory|公因数、公倍数|解释gcd与lcm关系并避免先乘溢出|混淆公因数与公倍数|最大公约数,最小公倍数,gcd,lcm
5|congruence|同余与模运算|1|1.division||解释同余关系并正确处理加减乘取模|直接对除法套取模规则|同余,模运算
5|factorization|质因数分解与唯一分解定理|1,4|5.number-theory||给出分解并解释质因子指数的含义|把因子集合当作带重数分解|质因数,分解定理,质因子
5|big-add|数组模拟高精度加法|2|3.array,1.arithmetic|竖式加法和进位|按位存储并传播进位|末位进位未输出|高精度,进位,大整数
5|big-subtract|数组模拟高精度减法|2|5.big-add|借位减法|正确比较大小、借位并处理前导零|遗漏借位或结果符号|高精度,借位
5|big-multiply|数组模拟高精度乘法|2|5.big-add|竖式乘法|解释每一位乘积的累积位置和进位|边累加边错误覆盖中间位|高精度,大整数,乘法
5|big-divide|数组模拟高精度除法|2|5.big-subtract|长除法、余数|说明从高位到低位确定商与余数的过程|只支持整除却忽略余数|高精度,大整数,除法
5|linked-list|单链表、双链表与循环链表|3|4.pointer,4.struct||实现建立、插入、删除、遍历与反转并维护边界|修改链接顺序导致剩余节点丢失|链表,节点,next,prev
5|euclid|欧几里得算法|4|5.gcd-lcm||解释取余后公约数集合不变及终止条件|除数为0时仍做取余|欧几里得,辗转相除,gcd
5|eratosthenes|埃氏筛|4|5.number-theory,3.array||说明筛去合数与遍历范围|把质数本身也划掉|埃氏,筛法,素数表
5|linear-sieve|线性筛|4|5.eratosthenes||说明每个合数由其最小质因子唯一筛去|缺失break导致复杂度变化|线性筛
5|complexity|多项式、对数和递归效率|5|4.complexity|对数与指数增长的直观概念|比较线性、对数和递归算法的资源增长|把递归深度等同于总调用次数|复杂度,对数,O(
5|binary-search|有序范围的二分查找|6|3.array,4.complexity||维持区间不变量并处理不存在和重复值|端点更新不收缩导致死循环|二分查找,lower_bound,upper_bound
5|binary-answer|单调判定与二分答案|6|5.binary-search||把最优化转为单调可行性检查并证明边界|未经验证就假设可行性单调|二分答案,木材,切割,单调
5|recursion|递归基例、调用与返回|7|4.function,4.complexity||说明基例和规模缩小并跟踪调用栈|没有终止条件或重复子问题失控|递归,调用栈
5|greedy|贪心选择与正确性理由|8|4.sort-concepts,3.enumeration||说明局部选择为何不损害最优解并检验反例|将看起来最大的局部收益当全局最优|贪心,最优子结构
5|merge-sort|分治与归并排序|9|5.recursion,3.array||解释分解、递归与合并并分析额外空间|合并时遗漏剩余元素|归并,分治
5|quick-sort|分治与快速排序|9|5.recursion,4.sort-concepts||完成分区并解释最坏情况与重复元素|分区端点不收缩或误认为永远nlogn|快速排序,快排,分治
6|tree|树的定义、构造与遍历|1|5.recursion,3.array||解释根、父子、深度和叶子并完成遍历|把一般图默认当树|树,叶子,父节点,子树
6|complete-tree|完全二叉树|2|6.tree||区分完全二叉树与满二叉树|认为节点数相同就具有相同结构|完全二叉树,满二叉树
6|bst|二叉排序树与搜索|2,4|6.tree,5.binary-search||维护左右子树次序并分析不平衡情况|把二叉排序树误认为总是平衡|二叉排序树,二叉搜索树,BST
6|huffman-tree|哈夫曼树|2|6.tree,5.greedy||用权重构造树并解释带权路径长度|将频率高的字符分配更深路径|哈夫曼树,带权路径
6|huffman-code|哈夫曼编码|3|6.huffman-tree,3.bitwise||说明前缀编码与树路径的关系|用定长编码性质解释变长编码|哈夫曼编码,前缀编码
6|gray-code|格雷编码|3|3.bitwise||验证相邻编码仅一位变化|将普通二进制序列当格雷码|格雷,Gray
6|dfs|深度优先搜索|4|5.recursion,6.tree||定义状态、访问或回溯规则并避免重复|返回时忘记恢复需回溯的状态|DFS,深度优先,回溯
6|bfs|广度优先搜索|4|6.queue||按层扩展并说明无权最短步数条件|把有权最短路直接套BFS|BFS,广度优先,宽度优先
6|dp-linear|一维动态规划|5|4.recurrence,4.complexity||定义状态含义、转移、初值及计算顺序|只套公式而不说明状态和边界|动态规划,dp[,状态转移
6|knapsack|简单背包|5|6.dp-linear,3.array||说明容量状态和每件物品次数约束|0/1背包按错误方向更新变成可重复选|背包,容量,重量,价值
6|class|面向对象思想及类的创建与初始化|6|4.struct,4.function||区分类与对象并正确初始化成员|把类当某个对象的实例|class,对象,构造函数
6|encapsulation|封装|6|6.class||说明访问控制和接口作用|将所有成员公开当成封装|封装,public,private,protected
6|inheritance|继承|6|6.class||解释派生类与基类的关系|混淆继承与包含一个成员对象|继承,基类,派生类
6|polymorphism|多态基础|6|6.inheritance,4.pointer||区分静态类型与动态派发的基本情形|认为所有同名函数都会动态派发|多态,virtual,虚函数
6|stack|栈|7|3.array||按后进先出处理入栈出栈并检查空栈|将出栈顺序当作入栈顺序|栈,stack,LIFO
6|queue|队列|7|3.array||按先进先出管理队首队尾|删除队首却不更新状态|队列,queue,FIFO
6|circular-queue|循环队列|7|6.queue,1.division||解释环形索引和判空判满约定|头尾重合时无法区分空与满|循环队列
7|trigonometry|三角函数库|1|2.math-functions|角、弧度和基本三角函数|以弧度调用sin、cos并解释值域|把角度值直接当弧度|sin,cos,tan,三角函数,弧度
7|logarithm|对数函数库|1|2.math-functions|指数与对数、定义域|区分log、log2、log10的底与定义域|把自然对数当十进制对数|log,对数
7|exponential|指数函数库|1|2.math-functions|e与指数函数的概念|区分exp与一般幂计算并考虑范围|把exp(x)当x的平方|exp,pow,指数函数
7|dp-two-dimensional|二维动态规划|2|6.dp-linear,4.matrix||定义双维状态并选择合法计算顺序|使用尚未计算的状态|二维动态规划,dp[,状态
7|dp-interval|区间动态规划|2|7.dp-two-dimensional||按区间长度计算并解释分割点|区间边界或合并代价重复计算|区间动态规划,区间DP,区间dp
7|lis|最长上升子序列|2|6.dp-linear,5.binary-search||区分严格上升和非降及子序列与连续段|把连续递增段的扫描方法当LIS|LIS,最长上升,最长递增子序列
7|lcs|最长公共子序列|2|7.dp-two-dimensional,3.strings||按末字符是否相同推导二维转移|把公共子串与公共子序列混为一谈|LCS,最长公共子序列
7|dp-extrema|动态规划最值优化|2|7.dp-two-dimensional||说明优化所利用的状态结构及成立前提|未经证明丢弃候选转移|最值优化,动态规划优化
7|rolling-array|滚动数组与空间优化|2|7.dp-two-dimensional||解释转移依赖并避免覆盖仍需的旧状态|按错误方向覆盖上一层值|滚动数组,空间优化
7|graph-model|有向图、无向图、度与存储表示|3|6.tree,4.matrix||由问题建立顶点和边并比较矩阵与邻接表|漏反向边或混淆入度与出度|图,邻接表,邻接矩阵,入度,出度,顶点
7|graph-dfs|图的深度优先遍历|3|6.dfs,7.graph-model||在有环或不连通图中处理访问标记|缺访问标记导致重复递归|DFS,深度优先遍历
7|graph-bfs|图的广度优先遍历|3|6.bfs,7.graph-model||按入队时标记避免重复扩展并覆盖分量|出队才标记造成大量重复入队|BFS,广度优先遍历
7|flood-fill|泛洪与连通区域|3|7.graph-dfs,4.matrix||明确邻接规则并统计区域|将四邻接和八邻接混用|泛洪,Flood,flood,连通块,区域
7|hash|哈希表与冲突处理|4|3.array,1.division||说明键到槽位映射和冲突处理|把哈希相等当成键一定相同|哈希,散列,hash,unordered
8|count-add|加法原理|1|3.enumeration|不相交分类计数|说明分类互斥且覆盖全部结果|有交集的类别直接相加|加法原理,计数
8|count-multiply|乘法原理|1|8.count-add|分步选择计数|说明各步骤选择数和限制关系|把相关选择错误当独立固定选择|乘法原理,计数
8|permutation|排列|2|8.count-multiply|阶乘与有序选择|区分是否计顺序并计算排列数|将不同顺序错误合并|排列,阶乘
8|combination|组合|2|8.permutation||解释从排列到组合的重复计数修正|把选择顺序计入组合结果|组合,二项式
8|pascal|杨辉三角及其实现|3|4.recurrence,8.combination||解释相邻求和与组合数关系|边界初始化遗漏|杨辉,帕斯卡,Pascal
8|doubling|倍增|4|3.bitwise,4.recurrence,5.complexity|二进制分解|预处理倍数步转移并按二进制组合查询|把预处理层数或查询位数设错|倍增,快速幂
8|algebra|一元一次与二元一次方程|5|1.arithmetic|初中代数、方程和消元|把条件转为方程并处理无解和特殊系数|未检查除数或忽略解的范围|方程,消元
8|geometry|三角形、圆与长方形面积|5|2.math-functions|初中平面几何|正确建立面积表达式并处理单位与精度|混淆长度与面积或忽略浮点误差|面积,圆,三角形,几何
8|mst|最小生成树的定义|6|7.graph-model,5.greedy||区分生成树和最短路径树并说明连通前提|把最短路树当最小生成树|最小生成树,生成树,MST
8|kruskal|Kruskal 算法|6|8.mst,4.sort-concepts||按边权选择不形成环的边并处理不连通图|仅选最小边而不检测环|Kruskal,kruskal
8|prim|Prim 算法|6|8.mst||维护已选集合到外部的最小连接边|误用从源点起的路径长度更新|Prim,prim
8|dijkstra|Dijkstra 单源最短路|6|7.graph-model,5.greedy||在非负边权前提下维护松弛与定点过程|含负边时仍直接使用Dijkstra|Dijkstra,dijkstra,单源最短
8|floyd|Floyd 多源最短路|6|7.dp-two-dimensional,7.graph-model||按中间点递推解释全点对最短路|将Floyd误称为仅单源或循环顺序不当|Floyd,floyd
8|complexity|综合时间与空间效率分析|7|5.complexity,7.dp-two-dimensional,7.graph-model||分析排序、查找、树图、搜索、分治与DP的整体资源|只看一段局部循环而漏掉外层调用|时间复杂度,空间复杂度,效率
8|optimization|算法与数学优化|8|8.complexity|等差、等比求和与代数变换|比较等价方案并说明优化的前提和代价|先优化却改变原问题语义或忽略溢出|优化,等差,等比,求和公式
""".strip()


def main():
    manifest = json.loads((OUT / 'sources.json').read_text('utf-8'))
    syllabus = next(d for d in manifest['documents'] if any(r['role'] == 'syllabus' for r in d['references']))
    clauses = syllabus_clauses(syllabus)
    by_id = {x['id']: x for x in clauses}
    atoms = []
    for line in DEFINITIONS.splitlines():
        parts = line.split('|')
        if len(parts) != 9:
            raise ValueError(f'Expected nine fields: {line}')
        level, slug, name, numbers, pre, math, goal, error, terms = parts
        level = int(level)
        refs = [by_id[f'gesp-cpp.l{level}.clause{int(n):02d}'] for n in numbers.split(',')]
        prerequisites = ['gesp-cpp.l' + x for x in pre.split(',') if x]
        atoms.append({'id': f'gesp-cpp.l{level}.{slug}', 'track': 'gesp-cpp', 'level': level,
                      'name': name, 'prerequisiteIds': prerequisites,
                      'prerequisiteBasis': 'instructional_proposal_not_official_order',
                      'mathPrerequisites': [math] if math else [],
                      'successCriterion': goal, 'commonErrorToInvestigate': error,
                      'sourceClauseIds': [x['id'] for x in refs],
                      'sourceEvidence': [{'pdfUrl': x['pdfUrl'], 'pdfSha256': x['pdfSha256'],
                                          'pdfPages': x['pdfPages'], 'clauseId': x['id']} for x in refs],
                      'searchTerms': [x.strip() for x in terms.split(',') if x.strip()],
                      'decompositionBasis': 'agent_prepared_from_official_syllabus',
                      'reviewStatus': 'draft', 'publicationStatus': 'research_only',
                      'measurementStatus': 'independent_probes_not_authored',
                      'priority': 'initial_track' if level <= 4 else 'reference_track'})
    ids = {x['id'] for x in atoms}
    for atom in atoms:
        if set(atom['prerequisiteIds']) - ids:
            raise ValueError('Unknown prerequisite in ' + atom['id'])
    used = {x for a in atoms for x in a['sourceClauseIds']}
    if used != set(by_id):
        raise ValueError('Unmapped syllabus clauses: ' + str(set(by_id) - used))
    result = {'format': 'gesp-knowledge-preparation-v1', 'version': '2026-10-20-v1',
              'track': 'gesp-cpp', 'runtimeCompatible': False, 'integrationStatus': 'research_workbench_only',
              'languageStandard': 'C++11 unless an exam explicitly specifies otherwise',
              'officialScope': 'CCF syllabus PDF linked by the 2026-01-28 revision announcement',
              'scopeConstraints': [
                  {'levels': [1], 'rule': 'Bitwise operations removed from level 1 in the 2026-01-28 revision.'},
                  {'levels': [3, 4], 'rule': 'C++ arrays exclude variable-length arrays.'},
                  {'levels': [4], 'rule': 'Functions exclude anonymous functions and class call-operator overloading.'},
                  {'levels': list(range(1, 9)), 'rule': 'Do not execute undefined behavior to establish an answer. Review historical questions against their original syllabus/version.'}],
              'atoms': atoms}
    write_json(OUT / 'knowledge-map.json', result)
    lines = ['# GESP C++ 知识点准备图谱', '',
             '下表的知识范围取自官方 PDF，拆点、先修关系、数学准备和掌握标准是教学候选设计，全部待审核。认证等级独立于小学年级。', '',
             '数据见 [knowledge-map.json](knowledge-map.json)，逐条大纲原文见 [syllabus-clauses.json](syllabus-clauses.json)。', '']
    for level in range(1, 9):
        selected = [a for a in atoms if a['level'] == level]
        lines += [f'## {level} 级', '', '| 知识点 | 独立完成标准 | 应调查的易错表现 |', '| --- | --- | --- |']
        for atom in selected:
            lines.append(f'| {atom["name"]} | {atom["successCriterion"]} | {atom["commonErrorToInvestigate"]} |')
        lines.append('')
    (OUT / 'KNOWLEDGE.md').write_text('\n'.join(lines), 'utf-8')
    print(json.dumps({'atoms': len(atoms), 'officialClauses': len(clauses),
                      'initialTrackAtoms': sum(a['level'] <= 4 for a in atoms)}, ensure_ascii=False))


if __name__ == '__main__':
    main()
