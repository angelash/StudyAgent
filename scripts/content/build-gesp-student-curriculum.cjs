// Produces the original GESP student pilot from explicit authored specs. Hidden tests never enter the UI.
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const base = JSON.parse(fs.readFileSync(path.join(root, 'resources/gesp/student-curriculum-v1-base.json'), 'utf8'));
const knowledge = JSON.parse(fs.readFileSync(path.join(root, 'resources/gesp/knowledge-map.json'), 'utf8'));
const byId = new Map(base.tasks.map(task => [task.atomId, task]));
const add = (atomId, slug, title, prompt, concept, trace, tests) => {
  if (byId.has(atomId)) throw new Error(`Duplicate atom task: ${atomId}`);
  byId.set(atomId, { id: `gesp-student-cpp-${slug}`, atomId, title, prompt, language: 'cpp', standard: 'C++17',
    timeLimitSeconds: 2, memoryLimitMiB: 256, reviewStatus: 'original_authored_pilot',
    probes: [{ id: `gesp-student-cpp-${slug}-concept`, dimension: 'understanding', ...concept },
      { id: `gesp-student-cpp-${slug}-trace`, dimension: 'procedure', ...trace }], tests });
};
const caseOf = (input, expected) => ({ input, expected });

add('gesp-cpp.l1.computer', 'computer-flow', '输入处理与输出的信息流',
  '读入两个整数，计算它们的和，再输出“process=和”。',
  { prompt: '一次程序执行中，内存主要承担什么角色？', options: ['暂存输入、中间结果和输出前的数据', '永久保存所有网络文件', '只显示文字'], answer: '暂存输入、中间结果和输出前的数据', analysis: '输入数据进入内存，CPU按程序处理，输出设备显示结果。' },
  { prompt: '输入2和5时，程序按题目格式输出什么？', options: ['process=7', '7', 'input=25'], answer: 'process=7' },
  [caseOf('2 5\n', 'process=7\n'), caseOf('-3 9\n', 'process=6\n'), caseOf('0 0\n', 'process=0\n')]);

add('gesp-cpp.l1.ide', 'ide-compile-run', '区分编译错误与运行结果',
  '读入一个正整数n，输出compile-ok；若n不为正，输出invalid。',
  { prompt: '源代码缺少分号通常在哪一阶段暴露？', options: ['编译阶段', '程序已经开始正常输出后', '只能由网络检查'], answer: '编译阶段', analysis: '语法错误由编译器在生成程序前报告。' },
  { prompt: '输入0时，程序输出什么？', options: ['invalid', 'compile-ok', '程序没有输出'], answer: 'invalid' },
  [caseOf('3\n', 'compile-ok\n'), caseOf('0\n', 'invalid\n'), caseOf('-1\n', 'invalid\n')]);

add('gesp-cpp.l1.identifiers', 'identifier-validity', '判断C++标识符是否合法',
  '读入一个不含空格的名称。若它符合C++标识符的简化规则（首字符为字母或下划线，其余为字母、数字或下划线），输出valid；否则输出invalid。本题不把关键字判为合法变量名。',
  { prompt: '下列哪个名称可以作为普通变量名？', options: ['score_2', '2score', 'int'], answer: 'score_2', analysis: '标识符不能以数字开头，int是关键字。' },
  { prompt: '名称“total-score”按本题简化规则应输出什么？', options: ['invalid', 'valid', 'keyword'], answer: 'invalid' },
  [caseOf('score_2\n', 'valid\n'), caseOf('_tmp9\n', 'valid\n'), caseOf('2score\n', 'invalid\n'), caseOf('int\n', 'invalid\n')]);

add('gesp-cpp.l1.variables', 'variable-state', '用变量状态表更新两个值',
  '读入a和b。先令c=a+b，再令a=b、b=c，最后按a、b的当前值用空格分隔输出。',
  { prompt: '赋值语句a=b执行后，a保存的是什么？', options: ['b当时的值', 'a原来的值', '两个值相加'], answer: 'b当时的值', analysis: '赋值把右侧当前值复制到左侧变量。' },
  { prompt: '输入a=3、b=7时，最终输出是什么？', options: ['7 10', '3 7', '10 7'], answer: '7 10' },
  [caseOf('3 7\n', '7 10\n'), caseOf('-2 5\n', '5 3\n'), caseOf('0 0\n', '0 0\n')]);

add('gesp-cpp.l1.types', 'type-format', '按类型保存并输出整数、字符与浮点数',
  '依次读入整数、一个字符和一个浮点数，输出int=整数、char=字符、double=浮点数（保留两位小数），三项用分号分隔。',
  { prompt: '要保存3.50这类带小数的值，更适合使用哪种类型？', options: ['double', 'char', 'bool'], answer: 'double', analysis: 'double保存浮点数；char保存单个字符。' },
  { prompt: '输入42、Z、3.50时应输出什么？', options: ['int=42;char=Z;double=3.50', 'int=Z;char=42;double=3', '42 Z 3.50'], answer: 'int=42;char=Z;double=3.50' },
  [caseOf('42 Z 3.50\n', 'int=42;char=Z;double=3.50\n'), caseOf('-7 a 0\n', 'int=-7;char=a;double=0.00\n'), caseOf('9 # 12.345\n', 'int=9;char=#;double=12.35\n')]);

add('gesp-cpp.l1.arithmetic', 'arithmetic-priority', '按括号和运算优先级计算',
  '读入整数a、b、c，计算并输出(a+b)*c。',
  { prompt: '表达式(a+b)*c中，先执行哪一步？', options: ['a+b', 'b*c', 'a*c'], answer: 'a+b', analysis: '括号内运算优先。' },
  { prompt: 'a=2、b=3、c=4时结果是多少？', options: ['20', '14', '10'], answer: '20' },
  [caseOf('2 3 4\n', '20\n'), caseOf('-2 5 3\n', '9\n'), caseOf('7 -7 100\n', '0\n')]);

add('gesp-cpp.l1.logic', 'logic-bits', '计算两个布尔值的与、或',
  '读入两个0或1的整数a和b。依次输出a&&b与a||b，用空格分隔。',
  { prompt: '在C++中，0表示什么逻辑值？', options: ['false', 'true', '未知'], answer: 'false', analysis: '0转为false，非0转为true。' },
  { prompt: 'a=0、b=1时，a&&b和a||b分别是？', options: ['0 1', '1 0', '1 1'], answer: '0 1' },
  [caseOf('0 1\n', '0 1\n'), caseOf('1 1\n', '1 1\n'), caseOf('0 0\n', '0 0\n')]);

add('gesp-cpp.l1.loop-control', 'loop-continue', '用continue跳过指定倍数',
  '读入正整数n，累加1到n中不能被3整除的数，输出累加和。',
  { prompt: 'continue执行后，本次循环余下语句怎样处理？', options: ['跳过本次余下语句，进入下一次迭代', '结束整个程序', '回到程序第一行'], answer: '跳过本次余下语句，进入下一次迭代' },
  { prompt: 'n=5时，1到5中排除3后的和是多少？', options: ['12', '15', '9'], answer: '12' },
  [caseOf('5\n', '12\n'), caseOf('6\n', '12\n'), caseOf('1\n', '1\n')]);

add('gesp-cpp.l1.debug', 'debug-input-output', '修复输入输出并完成计算',
  '读入两个整数，输出两数乘积与两数差，用空格分隔。必须从标准输入读取并按标准输出写结果。',
  { prompt: '程序运行后没有任何输出，首先应检查什么？', options: ['是否实际执行了输出语句且输入正确', '显卡颜色', '浏览器缓存'], answer: '是否实际执行了输出语句且输入正确' },
  { prompt: '输入4和7时，按题目顺序输出什么？', options: ['28 -3', '-3 28', '11 3'], answer: '28 -3' },
  [caseOf('4 7\n', '28 -3\n'), caseOf('0 9\n', '0 -9\n'), caseOf('-2 5\n', '-10 -7\n')]);

add('gesp-cpp.l2.memory', 'memory-latency-order', '按速度排列存储器层次',
  '读入三个编号1、2、3，分别表示RAM、Cache、ROM。按“Cache、RAM、ROM”的速度层次输出这三个编号。',
  { prompt: 'Cache与内存RAM相比，通常哪一项更快？', options: ['Cache', 'RAM', '两者速度完全相同'], answer: 'Cache', analysis: 'Cache靠近CPU，延迟通常低于RAM。' },
  { prompt: '输入仅用于表示三类存储时，题目要求的第一项是什么？', options: ['Cache', 'RAM', 'ROM'], answer: 'Cache' },
  [caseOf('1 2 3\n', '2 1 3\n'), caseOf('3 1 2\n', '2 1 3\n'), caseOf('2 3 1\n', '2 1 3\n')]);

add('gesp-cpp.l2.network', 'ipv4-boundary', '检查IPv4四段范围',
  '读入四个整数，若都在0到255之间（含端点），输出valid，否则输出invalid。',
  { prompt: 'IPv4地址由几个0～255的十进制段组成？', options: ['4', '6', '8'], answer: '4', analysis: '本题使用常见点分十进制IPv4形式。' },
  { prompt: '输入192 168 1 255时应输出什么？', options: ['valid', 'invalid', 'network'], answer: 'valid' },
  [caseOf('192 168 1 255\n', 'valid\n'), caseOf('256 1 1 1\n', 'invalid\n'), caseOf('0 0 0 0\n', 'valid\n')]);

add('gesp-cpp.l2.languages', 'language-class', '区分计算机语言层次',
  '读入编号1、2、3，分别代表机器语言、汇编语言、高级语言；输出对应中文名称。',
  { prompt: '由助记符表示、通常贴近特定硬件的是哪种语言？', options: ['汇编语言', '高级语言', '自然语言'], answer: '汇编语言' },
  { prompt: '输入3时输出什么？', options: ['高级语言', '汇编语言', '机器语言'], answer: '高级语言' },
  [caseOf('1\n', '机器语言\n'), caseOf('2\n', '汇编语言\n'), caseOf('3\n', '高级语言\n')]);

add('gesp-cpp.l2.flowchart', 'flowchart-sequence', '按流程图顺序更新变量',
  '流程图依次执行：读入n；把n乘2；再加1；输出结果。请实现该流程。',
  { prompt: '流程图先乘2再加1与先加1再乘2，结果一般是否相同？', options: ['不同', '总相同', '无法定义'], answer: '不同', analysis: '运算顺序改变结果，例如3按两种流程分别得7和8。' },
  { prompt: 'n=3时，按题目流程输出什么？', options: ['7', '8', '6'], answer: '7' },
  [caseOf('3\n', '7\n'), caseOf('0\n', '1\n'), caseOf('-4\n', '-7\n')]);

add('gesp-cpp.l2.ascii', 'ascii-neighbor', '利用字符编码关系转换',
  '读入一个可见ASCII字符c，输出它的后一个字符及该字符的整数编码，两项用空格分隔。',
  { prompt: '若字符a的ASCII编码是97，字符b的编码是？', options: ['98', '96', '65'], answer: '98' },
  { prompt: '输入A时，输出字符和编码是什么？', options: ['B 66', 'A 65', 'C 67'], answer: 'B 66' },
  [caseOf('A\n', 'B 66\n'), caseOf('a\n', 'b 98\n'), caseOf('0\n', '1 49\n')]);

add('gesp-cpp.l2.conversion', 'conversion-order', '观察整数除法与乘法的转换差异',
  '读入整数a与b，先输出整数除法a/b，再输出a/b的浮点数结果（保留三位小数），用空格分隔。b保证非0。',
  { prompt: 'C++中两个int做a/b时，3/2的结果是什么？', options: ['1', '1.5', '2'], answer: '1', analysis: '整数除法舍弃小数部分。' },
  { prompt: 'a=3、b=2时，按题目两位输出格式结果是什么？', options: ['1 1.500', '1.5 1', '2 1.500'], answer: '1 1.500' },
  [caseOf('3 2\n', '1 1.500\n'), caseOf('-7 2\n', '-3 -3.500\n'), caseOf('9 3\n', '3 3.000\n')]);

add('gesp-cpp.l2.branches', 'nested-grade-branch', '使用多层分支确定等级',
  '读入整数分数s（0～100）。90及以上输出A，80～89输出B，60～79输出C，低于60输出D。',
  { prompt: '多层if/else中，else通常与哪个条件配对？', options: ['最近的未配对if', '最外层if', '第一个if'], answer: '最近的未配对if' },
  { prompt: 's=80时输出什么？', options: ['B', 'C', 'A'], answer: 'B' },
  [caseOf('95\n', 'A\n'), caseOf('80\n', 'B\n'), caseOf('60\n', 'C\n'), caseOf('59\n', 'D\n')]);

add('gesp-cpp.l2.nested-loops', 'nested-star-grid', '用两层循环输出行列图形',
  '读入正整数n，输出n行，每行恰好n个星号，行末无多余空格。',
  { prompt: '外层循环控制什么？', options: ['行数', '每行字符数', '程序退出时间'], answer: '行数' },
  { prompt: 'n=3时应输出几行星号、每行几个？', options: ['3行，每行3个', '2行，每行3个', '3行，每行1个'], answer: '3行，每行3个' },
  [caseOf('2\n', '**\n**\n'), caseOf('3\n', '***\n***\n***\n'), caseOf('1\n', '*\n')]);

add('gesp-cpp.l2.math-functions', 'math-function-choice', '选择数值函数并保持结果类型',
  '读入两个整数a和b，依次输出a的绝对值、a与b的最大值、a与b的最小值，用空格分隔。',
  { prompt: '求两数的较大值应使用哪个标准库函数？', options: ['max', 'sqrt', 'abs'], answer: 'max' },
  { prompt: 'a=-8、b=3时三个结果依次是什么？', options: ['8 3 -8', '8 -8 3', '-8 3 -8'], answer: '8 3 -8' },
  [caseOf('-8 3\n', '8 3 -8\n'), caseOf('5 5\n', '5 5 5\n'), caseOf('12 -20\n', '12 12 -20\n')]);

add('gesp-cpp.l2.random', 'lcg-pseudorandom', '实现可复现的伪随机状态更新',
  '使用线性同余规则state=(state*1103515245+12345)%2147483648。读入初始state和n，更新n次后输出state。',
  { prompt: '设置相同种子并使用相同算法时，伪随机序列应怎样？', options: ['可复现地相同', '每次都必然不同', '只取决于屏幕大小'], answer: '可复现地相同', analysis: '种子和算法确定状态序列。' },
  { prompt: '本题公式中，新状态由什么决定？', options: ['旧状态、乘数、增量和模数', '时间与颜色', '输入字符长度'], answer: '旧状态、乘数、增量和模数' },
  [caseOf('1 1\n', '1103527590\n'), caseOf('0 0\n', '0\n'), caseOf('42 1\n', '1250496027\n')]);

add('gesp-cpp.l3.number-code', 'twos-complement-byte', '输出8位补码编码',
  '读入-128到127之间的整数，输出它的8位补码二进制串。',
  { prompt: '8位补码中，-1的编码是什么？', options: ['11111111', '10000001', '00000001'], answer: '11111111' },
  { prompt: '8位补码“11111011”对应的十进制数是多少？', options: ['-5', '251', '5'], answer: '-5' },
  [caseOf('5\n', '00000101\n'), caseOf('-1\n', '11111111\n'), caseOf('-128\n', '10000000\n'), caseOf('127\n', '01111111\n')]);

add('gesp-cpp.l3.base', 'base-conversion', '按任意进制2～16输出整数',
  '读入非负整数n与进制b（2～16），输出n的b进制表示，10～15的数位使用大写A～F。',
  { prompt: '十进制10写成十六进制是什么？', options: ['A', '10', 'F'], answer: 'A' },
  { prompt: '十进制13写成二进制是什么？', options: ['1101', '1011', '1110'], answer: '1101' },
  [caseOf('13 2\n', '1101\n'), caseOf('255 16\n', 'FF\n'), caseOf('0 7\n', '0\n'), caseOf('64 8\n', '100\n')]);

add('gesp-cpp.l3.bitwise', 'bitwise-three', '逐位执行与、或、异或',
  '读入两个非负整数a、b，依次输出a&b、a|b、a^b，用空格分隔。',
  { prompt: '与逻辑与相比，按位与的“两位都1才为1”规则作用于哪里？', options: ['每个二进制位', '整段文字的字符数', '只作用于最低位'], answer: '每个二进制位' },
  { prompt: 'a=6、b=3时三个结果依次是什么？', options: ['2 7 5', '0 9 5', '2 5 7'], answer: '2 7 5' },
  [caseOf('6 3\n', '2 7 5\n'), caseOf('8 8\n', '8 8 0\n'), caseOf('0 15\n', '0 15 15\n')]);

add('gesp-cpp.l3.shift', 'shift-left-right', '计算有效的左右移位',
  '读入非负整数a与k（0≤k≤10），依次输出a<<k和a>>k，用空格分隔。',
  { prompt: '无符号非负整数左移1位通常等价于什么？', options: ['乘以2', '除以2', '加2'], answer: '乘以2' },
  { prompt: 'a=5、k=2时输出什么？', options: ['20 1', '10 2', '7 3'], answer: '20 1' },
  [caseOf('5 2\n', '20 1\n'), caseOf('1 0\n', '1 1\n'), caseOf('1024 10\n', '1048576 1\n')]);

add('gesp-cpp.l3.algorithm-description', 'algorithm-parity-count', '把文字算法实现为有限步骤程序',
  '算法描述：读入n；统计1到n中奇数个数；输出计数。请实现该算法。',
  { prompt: '算法描述至少应明确什么？', options: ['输入、输出和有限步骤', '编程软件图标', '显示器分辨率'], answer: '输入、输出和有限步骤' },
  { prompt: 'n=5时1到5的奇数有几个？', options: ['3', '2', '5'], answer: '3' },
  [caseOf('5\n', '3\n'), caseOf('6\n', '3\n'), caseOf('1\n', '1\n'), caseOf('0\n', '0\n')]);

add('gesp-cpp.l3.array', 'array-summary', '遍历一维数组恢复汇总值',
  '读入n与n个整数，输出它们的和、最小值和最大值，用空格分隔。n至少为1。',
  { prompt: '合法下标范围通常是什么？', options: ['0到n-1', '1到n+1', '任意负数'], answer: '0到n-1' },
  { prompt: '数组3、-1、5的和、最小值、最大值依次是什么？', options: ['7 -1 5', '7 5 -1', '9 -1 5'], answer: '7 -1 5' },
  [caseOf('3\n3 -1 5\n', '7 -1 5\n'), caseOf('1\n8\n', '8 8 8\n'), caseOf('4\n-5 -2 -9 -1\n', '-17 -9 -1\n')]);

add('gesp-cpp.l3.strings', 'string-word-count', '读入整行并统计空白分隔单词',
  '使用getline读入一整行，统计其中由空白分隔的非空单词数并输出。',
  { prompt: '读入包含空格的整行，应优先使用什么？', options: ['getline', '一次cin>>int', '读取单个char后停止'], answer: 'getline' },
  { prompt: '输入“one  two three”应输出几个单词？', options: ['3', '2', '6'], answer: '3' },
  [caseOf('one two three\n', '3\n'), caseOf('  spaced   words  \n', '2\n'), caseOf('\n', '0\n')]);

add('gesp-cpp.l3.enumeration', 'enumeration-selected', '枚举范围内满足规则的数量',
  '读入正整数n，统计1到n中能被3或5整除的整数个数并输出。',
  { prompt: '枚举法必须保证候选满足什么要求？', options: ['不重复且不遗漏指定范围', '只列第一个', '使用随机数'], answer: '不重复且不遗漏指定范围' },
  { prompt: 'n=10时符合条件的数有多少个？', options: ['5', '4', '6'], answer: '5' },
  [caseOf('10\n', '5\n'), caseOf('1\n', '0\n'), caseOf('15\n', '7\n')]);

add('gesp-cpp.l3.simulation', 'robot-command-simulation', '按命令顺序维护位置状态',
  '读入起点x、y和命令串。U/D/L/R分别令y加1、y减1、x减1、x加1；按顺序执行后输出x y。',
  { prompt: '模拟多个命令时，每一步应基于什么状态更新？', options: ['上一步更新后的状态', '总是初始状态', '最后一个命令单独决定'], answer: '上一步更新后的状态' },
  { prompt: '从0 0依次执行U和R后位置是什么？', options: ['1 1', '0 1', '1 0'], answer: '1 1' },
  [caseOf('0 0\nUR\n', '1 1\n'), caseOf('2 3\nLD\n', '1 2\n'), caseOf('-1 4\nRDR\n', '1 3\n')]);

add('gesp-cpp.l4.pointer', 'pointer-value-address', '用指针读取并更新同一变量',
  '读入整数a和b。令指针指向a，通过指针把a加b，然后输出a与b。',
  { prompt: '若p=&a，表达式*p表示什么？', options: ['p所指向变量a的值', 'p的地址编号', 'b的值'], answer: 'p所指向变量a的值' },
  { prompt: 'a=3、b=4时经题目更新后输出什么？', options: ['7 4', '3 4', '7 7'], answer: '7 4' },
  [caseOf('3 4\n', '7 4\n'), caseOf('-2 9\n', '7 9\n'), caseOf('0 -5\n', '-5 -5\n')]);

add('gesp-cpp.l4.matrix', 'matrix-boundary', '遍历二维数组求边界元素和',
  '读入n、m和n行m列整数，输出第一行、最后一行、第一列、最后一列元素之和。角落元素只计算一次。',
  { prompt: '矩阵a[i][j]中的i通常表示什么？', options: ['行下标', '列下标', '元素值'], answer: '行下标' },
  { prompt: '矩阵第一行是1 2，第二行是3 4时，边界和是多少？', options: ['10', '8', '6'], answer: '10' },
  [caseOf('2 2\n1 2\n3 4\n', '10\n'), caseOf('1 4\n1 2 3 4\n', '10\n'), caseOf('3 1\n1\n2\n3\n', '6\n')]);

add('gesp-cpp.l4.struct', 'struct-best-score', '用结构体数组保存并比较记录',
  '读入n，再读入n个姓名和不含空格的整数分数。输出分数最高者的姓名；并列时输出最早出现者。',
  { prompt: '结构体适合把什么放在一起？', options: ['相关的不同类型字段', '程序外部的所有文件', '只适合单个整数'], answer: '相关的不同类型字段' },
  { prompt: '分数8、12、12时按题目规则选择谁？', options: ['第二个记录', '最后一个记录', '无法区分'], answer: '第二个记录' },
  [caseOf('2\nNora 8\nLeo 12\n', 'Leo\n'), caseOf('3\nAmy 9\nBen 12\nCid 12\n', 'Ben\n'), caseOf('1\nMia 0\n', 'Mia\n')]);

add('gesp-cpp.l4.function', 'function-factorial', '拆分函数计算并返回结果',
  '读入整数n（0≤n≤12），用一个函数计算n!并输出。',
  { prompt: '函数返回结果通常通过什么带回调用处？', options: ['return语句', '修改屏幕颜色', '关闭程序'], answer: 'return语句' },
  { prompt: '5!等于多少？', options: ['120', '25', '60'], answer: '120' },
  [caseOf('0\n', '1\n'), caseOf('5\n', '120\n'), caseOf('10\n', '3628800\n')]);

add('gesp-cpp.l4.scope', 'scope-shadow', '区分外层变量与内层同名变量',
  '读入整数x。在嵌套作用域中定义同名x=x+10；离开作用域后，输出外层x、内层x（按“outer=.. inner=..”格式）。',
  { prompt: '内层作用域重新定义同名变量时，会怎样？', options: ['暂时隐藏外层同名变量', '永久修改外层变量名', '程序一定编译失败'], answer: '暂时隐藏外层同名变量' },
  { prompt: '输入3时题目的输出格式是什么？', options: ['outer=3 inner=13', 'outer=13 inner=13', 'outer=3 inner=3'], answer: 'outer=3 inner=13' },
  [caseOf('3\n', 'outer=3 inner=13\n'), caseOf('-5\n', 'outer=-5 inner=5\n'), caseOf('0\n', 'outer=0 inner=10\n')]);

add('gesp-cpp.l4.parameter-value', 'parameter-value-copy', '观察值传递只修改参数副本',
  '写函数addTen(int value)返回value+10。读入整数x，输出函数返回值和原来x（按“returned=.. original=..”格式）。',
  { prompt: '值传递时，函数收到的是什么？', options: ['实参值的副本', '实参变量本身', '数据库连接'], answer: '实参值的副本' },
  { prompt: 'x=4时输出什么？', options: ['returned=14 original=4', 'returned=14 original=14', 'returned=4 original=14'], answer: 'returned=14 original=4' },
  [caseOf('4\n', 'returned=14 original=4\n'), caseOf('-3\n', 'returned=7 original=-3\n'), caseOf('0\n', 'returned=10 original=0\n')]);

add('gesp-cpp.l4.parameter-reference', 'parameter-reference-update', '观察引用参数更新实参',
  '写函数addTen(int& value)把value加10。读入整数x，调用后输出returned=x+10与updated=x+10。',
  { prompt: '引用参数与实参是什么关系？', options: ['引用成为实参的别名并按需修改它', '永远复制一份隔离值', '只能传字符串常量'], answer: '引用成为实参的别名并按需修改它' },
  { prompt: 'x=4时调用addTen(int&)后x是多少？', options: ['14', '4', '0'], answer: '14' },
  [caseOf('4\n', 'returned=14 updated=14\n'), caseOf('-3\n', 'returned=7 updated=7\n'), caseOf('0\n', 'returned=10 updated=10\n')]);

add('gesp-cpp.l4.recurrence', 'fibonacci-recurrence', '由边界和转移实现递推',
  '定义F(0)=0、F(1)=1、F(n)=F(n-1)+F(n-2)。读入n（0≤n≤45），输出F(n)。',
  { prompt: '递推式是否正确实现，至少需要核对什么？', options: ['初始状态、转移式和终止范围', '终端字体', '文件名长度'], answer: '初始状态、转移式和终止范围' },
  { prompt: 'F(6)是多少？', options: ['8', '13', '5'], answer: '8' },
  [caseOf('0\n', '0\n'), caseOf('1\n', '1\n'), caseOf('10\n', '55\n'), caseOf('20\n', '6765\n')]);

add('gesp-cpp.l4.sort-concepts', 'stable-record-sort', '按关键字保持同分记录原顺序',
  '读入n，再读入n个姓名和不含空格整数分数。按分数升序稳定排序后，每行输出姓名和分数。',
  { prompt: '相同关键字记录保持原相对顺序的排序性质叫什么？', options: ['稳定性', '递推性', '封装性'], answer: '稳定性' },
  { prompt: '输入Nora 8、Leo 5、Mia 8，稳定升序后姓名顺序是什么？', options: ['Leo Nora Mia', 'Leo Mia Nora', 'Nora Mia Leo'], answer: 'Leo Nora Mia' },
  [caseOf('2\nNora 8\nLeo 5\n', 'Leo 5\nNora 8\n'), caseOf('3\nNora 8\nLeo 5\nMia 8\n', 'Leo 5\nNora 8\nMia 8\n'), caseOf('1\nAmy 7\n', 'Amy 7\n')]);

add('gesp-cpp.l4.bubble', 'bubble-sort-impl', '独立实现冒泡排序',
  '读入n与n个整数，使用冒泡排序按升序输出，数字之间用空格分隔。',
  { prompt: '升序冒泡每轮结束后，哪个位置已确定？', options: ['本轮比较范围的最右位置', '第一个输入位置', '数组中间'], answer: '本轮比较范围的最右位置' },
  { prompt: '3、1、2按升序排序后是什么？', options: ['1 2 3', '3 2 1', '1 3 2'], answer: '1 2 3' },
  [caseOf('3\n3 1 2\n', '1 2 3\n'), caseOf('4\n-1 5 0 5\n', '-1 0 5 5\n'), caseOf('1\n9\n', '9\n')]);

add('gesp-cpp.l4.insertion', 'insertion-sort-impl', '独立实现插入排序',
  '读入n与n个整数，使用插入排序按升序输出，数字之间用空格分隔。',
  { prompt: '插入排序过程中，左侧前缀保持什么性质？', options: ['有序', '永远逆序', '全部为零'], answer: '有序' },
  { prompt: '数组2、-1、3的已排序左前缀如何形成？', options: ['[2]→[-1,2]→[-1,2,3]', '[2,3]→[-1,2,3]', '一次交换全部完成'], answer: '[2]→[-1,2]→[-1,2,3]' },
  [caseOf('3\n2 -1 3\n', '-1 2 3\n'), caseOf('4\n4 3 2 1\n', '1 2 3 4\n'), caseOf('2\n7 7\n', '7 7\n')]);

add('gesp-cpp.l4.selection', 'selection-sort-impl', '独立实现选择排序',
  '读入n与n个整数，使用选择排序按升序输出，数字之间用空格分隔。',
  { prompt: '升序选择排序每轮从剩余部分选出什么？', options: ['最小元素', '最大元素', '中间元素'], answer: '最小元素' },
  { prompt: '数组6、2、4第一轮选择后是什么？', options: ['2、6、4', '6、4、2', '4、2、6'], answer: '2、6、4' },
  [caseOf('3\n6 2 4\n', '2 4 6\n'), caseOf('4\n-2 8 0 -2\n', '-2 -2 0 8\n'), caseOf('1\n5\n', '5\n')]);

add('gesp-cpp.l4.complexity', 'loop-count-complexity', '由嵌套循环结构计算执行次数',
  '读入正整数n。输出下面双层循环的内层体执行次数：for(i=1;i<n;i++) for(j=i+1;j<=n;j++) body。同时输出growth=quadratic。',
  { prompt: 'n固定时，两层循环各约n次且内层依赖外层，通常是什么增长阶？', options: ['O(n²)', 'O(1)', 'O(2ⁿ)'], answer: 'O(n²)' },
  { prompt: 'n=4时内层体执行几次？', options: ['6', '8', '4'], answer: '6' },
  [caseOf('1\n', '0 growth=quadratic\n'), caseOf('4\n', '6 growth=quadratic\n'), caseOf('10\n', '45 growth=quadratic\n')]);

add('gesp-cpp.l4.file', 'file-roundtrip', '写入并重新读取本地数据文件',
  '读入整数n，使用文件流把n写入当前工作目录的data.txt，关闭后重新打开读回并输出文件中的值。',
  { prompt: '写完文件后立即重新读取前，为什么通常要关闭或flush输出流？', options: ['确保缓冲内容写入文件', '改变变量类型', '启动网络'], answer: '确保缓冲内容写入文件' },
  { prompt: '若写入12再正确读回，程序输出什么？', options: ['12', 'data.txt', '0'], answer: '12' },
  [caseOf('12\n', '12\n'), caseOf('-7\n', '-7\n'), caseOf('0\n', '0\n')]);

add('gesp-cpp.l4.exception', 'safe-division-exception', '用异常处理除数为零',
  '读入整数a、b。若b为0，输出undefined；否则输出a/b的整数商。可使用try/throw/catch或等价显式分支。',
  { prompt: 'try块中的异常通常由什么接收？', options: ['对应的catch块', '输出文件名称', '另一个程序进程'], answer: '对应的catch块' },
  { prompt: 'a=9、b=0时应输出什么？', options: ['undefined', '0', 'infinity'], answer: 'undefined' },
  [caseOf('9 0\n', 'undefined\n'), caseOf('9 2\n', '4\n'), caseOf('-8 3\n', '-2\n')]);

const tasks = [...byId.values()];
const authored = knowledge.atoms.filter(atom => atom.level >= 1 && atom.level <= 4);
if (tasks.length !== authored.length) throw new Error(`Expected ${authored.length} Level 1-4 tasks, got ${tasks.length}`);
if (new Set(tasks.map(task => task.atomId)).size !== tasks.length) throw new Error('Duplicate task atom');
for (const atom of authored) if (!byId.has(atom.id)) throw new Error(`Missing authored task: ${atom.id}`);
for (const task of tasks) {
  if (task.probes.length !== 2 || task.probes.some(probe => !probe.options.includes(probe.answer))) throw new Error(`Invalid probes: ${task.id}`);
  if (task.tests.length < 3 || new Set(task.tests.map(test => test.input)).size !== task.tests.length) throw new Error(`Invalid tests: ${task.id}`);
}
const output = { format: 'gesp-student-pilot-v2', version: '2026-10-21-v2', track: 'gesp-cpp', status: 'original_authored_pilot',
  notice: base.notice + ' 当前扩展为认证1～4级49个原创试点任务，系统/网络等概念由独立探针核查，程序题验证实现；全部内容仍待真人教研逐项审核。', tasks };
fs.writeFileSync(path.join(root, 'resources/gesp/student-curriculum-v2.json'), JSON.stringify(output, null, 2) + '\n');
console.log(JSON.stringify({ tasks: tasks.length, probes: tasks.reduce((sum, task) => sum + task.probes.length, 0),
  hiddenTests: tasks.reduce((sum, task) => sum + task.tests.length, 0) }));
