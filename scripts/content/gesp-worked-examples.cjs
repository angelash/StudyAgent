// Original editorial examples, aligned with the existing teaching example prompts.
// Program execution checks language behavior only; no approval or learner records.
const rows=[];
function trace(suffix,steps,boundary){rows.push({atomId:'gesp-cpp.'+suffix,steps,boundary});}
function cpp(suffix,steps,source,tests,boundary){rows.push({atomId:'gesp-cpp.'+suffix,steps,boundary,program:{standard:'C++17',source,tests}});}
const io=body=>'#include <iostream>\n'+body+'\n';
const test=(input,expected)=>({input,expected});

trace('l1.computer',[
 '先分清键盘是输入设备，显示器是输出设备，CPU处理指令，RAM保存执行时需要的数据。',
 '键盘输入8和6，程序把两个值保存为当前操作数。这里的箭头是逻辑信息流，真实机器还含控制器、总线和缓存。',
 'CPU执行加法，结果14可暂存在寄存器或内存，再经输出路径呈现在显示器上。',
 '若要关闭后继续保留结果，需要程序把文件写入持久存储；仅看到屏幕上的14不能说明已保存。'
],'这是组成与信息流的简化解释，不是CPU、内存或真实保存操作的实机验收。');
trace('l1.ide',[
 '先保存版本A并编译成功，记录构建出的程序A；再把源码改成缺分号的版本B并保存。',
 '编译器报告版本B的语法错误，未生成可替代A的新程序。此时源码文件与旧程序对应不同版本。',
 '如果IDE继续运行程序A，看到旧输出只能说明A能运行，不能说明B编译成功。',
 '修正分号并保存，重新编译成功后核对运行对象，再用已预测的输入验证新输出。'
],'不同IDE的失败后运行策略可能不同，需要在实际环境核对保存状态、构建日志及运行对象。');
cpp('l1.io',[
 '输入按读取顺序赋值：cin >> a >> b使a=12、b=5。',
 '减法保留左右次序：a-b=12-5=7；若先读b再读a则为5-12=-7。',
 '只输出结果和换行，不附加未要求的提示语；用负数与相同数再核对。'
],io('int main(){\n  long long a,b;\n  std::cin>>a>>b;\n  std::cout<<a-b<<"\\n";\n}'),[test('12 5\n','7\n'),test('5 12\n','-7\n'),test('-4 -4\n','0\n')],'本例输入是可读的有限范围整数，不宣称涵盖所有输入失败和溢出处理。');
trace('l1.identifiers',[
 '逐个检查首字符：score2与Score2以字母开头；2score首字符是数字，不满足当前标识符规则。',
 '再检查其余字符：前两个名称只有字母数字，大小写不同，所以它们代表两个不同名称。',
 'while虽然满足字形规则，但属于C++关键字，不能声明为普通变量名。',
 'total-score会被分成名称、减号和名称；可以改为total_score，并避免标准保留名称。'
],'这里核普通ASCII名称与关键字，不把简化字形判断器当作完整C++词法或保留名称审查。');
cpp('l1.variables',[
 '初始a=4、b=9。t=a先把旧a的4保存到t。',
 'a=b以后a=9、b=9、t=4；临时相等不说明旧值丢失，因为t还保留4。',
 'b=t以后a=9、b=4。用相同数和负数检查，交换规则不依赖大小。'
],io('int main(){\n  long long a,b;std::cin>>a>>b;\n  long long t=a;\n  a=b;\n  b=t;\n  std::cout<<a<<" "<<b<<"\\n";\n}'),[test('4 9\n','9 4\n'),test('-3 7\n','7 -3\n'),test('5 5\n','5 5\n')],'交换值不改变变量本身的类型；这段程序仅演示同类型的值交换。');
cpp('l1.types',[
 '3000000000超过常见32位有符号整数上界，选long long并在字面量后写LL。',
 '字符Q用单引号，温度18.75用double；三种值有不同的存储语义。',
 'fixed与setprecision(2)控制两位小数的显示，不把任意十进制小数变为精确存储。'
],'#include <iostream>\n#include <iomanip>\nint main(){\n  long long count=3000000000LL;\n  char label=\'Q\';\n  double temperature=18.75;\n  std::cout<<count<<" "<<label<<" "\n           <<std::fixed<<std::setprecision(2)<<temperature<<"\\n";\n}\n',[test('','3000000000 Q 18.75\n')],'这里只选一个能精确表示的示例值，不能据此推断所有小数均精确或所有平台的int位宽相同。');
cpp('l1.arithmetic',[
 'a=3、b=5、c=2。a+b*c先做5×2，再加3，得13。',
 '(a+b)*c先做3+5，再乘2，得16；括号改变表达式分组。',
 '分别输出两个结果，用包含0或负数的输入检查，不能把两个表达式当作恒等。'
],io('int main(){\n  long long a,b,c;std::cin>>a>>b>>c;\n  std::cout<<a+b*c<<" "<<(a+b)*c<<"\\n";\n}'),[test('3 5 2\n','13 16\n'),test('2 3 0\n','2 0\n'),test('-2 3 4\n','10 4\n')],'输入限制在各中间结果可用long long表示的范围；本例不执行有求值顺序争议的自增表达式。');
cpp('l1.division',[
 '29本每盒6本，先找不超过29的6的最大非负整数倍：6×4=24。',
 '整盒数是4，余下29-24=5本；5小于除数6。',
 '用29=4×6+5复核。再测恰好装完和0本，除数始终保持正数。'
],io('int main(){\n  long long books,capacity;std::cin>>books>>capacity;\n  if(books<0||capacity<=0)return 0;\n  std::cout<<books/capacity<<" "<<books%capacity<<"\\n";\n}'),[test('29 6\n','4 5\n'),test('24 6\n','4 0\n'),test('0 6\n','0 0\n')],'这个装盒模型只覆盖非负数量和正容量；C++负数商余语义需另作说明，不能由此模型直接推广。');
cpp('l1.relations',[
 '“至少10”包含边界10，因此条件是x>=10。',
 'x=9时为假；x=10时为真；x=11时为真。',
 '输出0或1便于检查；若误写x>10，只有边界10会暴露当前差异。'
],io('int main(){\n  long long x;std::cin>>x;\n  std::cout<<(x>=10)<<"\\n";\n}'),[test('9\n','0\n'),test('10\n','1\n'),test('11\n','1\n')],'比较结果与赋值语句不同；本例不把单个边界测试当完整程序证明。');
cpp('l1.logic',[
 '闭区间3到8要求同时满足x>=3和x<=8，用&&连接。',
 'x=2只满足右条件，结果假；x=3与8两条件都真，结果真。',
 'x=9只满足左条件，结果假。不能写成C++中的3<=x<=8。'
],io('int main(){\n  long long x;std::cin>>x;\n  std::cout<<(x>=3 && x<=8)<<"\\n";\n}'),[test('2\n','0\n'),test('3\n','1\n'),test('8\n','1\n'),test('9\n','0\n')],'本例演示逻辑与；逻辑或、非及短路求值仍应结合各自表达式另行核对。');
cpp('l1.sequence',[
 '初始x=2、y=5。执行x=x+y后先算旧2+5，再写回x，状态为7、5。',
 '执行y=x-y时读取的是新x=7和当前y=5，所以y=2。',
 '最终为7、2；每一行都从上一行的状态继续，不能同时使用全部初值。'
],io('int main(){\n  long long x=2,y=5;\n  x=x+y;\n  std::cout<<x<<" "<<y<<"\\n";\n  y=x-y;\n  std::cout<<x<<" "<<y<<"\\n";\n}'),[test('','7 5\n7 2\n')],'逐句输出用于观察本例状态，不是原编程试题新增的输出格式。');
cpp('l1.branch',[
 '先判断x<0，为真就输出negative，后面的else分支不再进入。',
 '若不小于0，再判断x==0；为真输出zero，否则只能是正数。',
 '用-1、0、1检查三个互斥分支，特别保留0的边界。'
],io('int main(){\n  long long x;std::cin>>x;\n  if(x<0)std::cout<<"negative\\n";\n  else if(x==0)std::cout<<"zero\\n";\n  else std::cout<<"positive\\n";\n}'),[test('-1\n','negative\n'),test('0\n','zero\n'),test('1\n','positive\n')],'这里演示if-else链；switch的离散分支及break需要另按各自语义分析。');
cpp('l1.loop',[
 '初始化s=0。i=1时满足i<=4，累加后s=1；更新i为2。',
 '后续i=2、3、4分别使s为3、6、10，每轮结束都执行更新。',
 'i=5时条件为假，不进入第五轮。n=0时循环体一次也不执行。'
],io('int main(){\n  int n;std::cin>>n;long long s=0;\n  for(int i=1;i<=n;++i){s+=i;}\n  std::cout<<s<<"\\n";\n}'),[test('4\n','10\n'),test('1\n','1\n'),test('0\n','0\n')],'演示输入限定0<=n<=1000，避免把循环终止与数值上界问题混在一起；do-while至少执行一次需另比。');
cpp('l1.loop-control',[
 'i=1和2分别输出。到i=3，continue跳过本轮输出，随后仍执行for的更新。',
 'i=4和5继续输出，因此第一行为1 2 4 5。',
 '第二个循环在i=3执行break，直接结束循环，第二行只有1 2。'
],io('int main(){\n  for(int i=1;i<=5;++i){\n    if(i==3)continue;\n    std::cout<<i<<" ";\n  }\n  std::cout<<"\\n";\n  for(int i=1;i<=5;++i){\n    if(i==3)break;\n    std::cout<<i<<" ";\n  }\n  std::cout<<"\\n";\n}'),[test('','1 2 4 5 \n1 2 \n')],'本演示有意保留每项后的空格，与原题输出格式分开；while中的continue还须检查更新是否被跳过。');
cpp('l1.debug',[
 '先设best为第一个输入值，依次和后两项比较；不能默认best=0，否则全负数会错。',
 '1、2、9使第三项为最大，能揭露遗漏第三项比较。',
 '再用-8、-2、-5核对初始化，用4、4、4核对相等值，不仅测试原正数例。'
],io('int main(){\n  long long a,b,c;std::cin>>a>>b>>c;\n  long long best=a;\n  if(b>best)best=b;\n  if(c>best)best=c;\n  std::cout<<best<<"\\n";\n}'),[test('1 2 9\n','9\n'),test('-8 -2 -5\n','-2\n'),test('4 4 4\n','4\n')],'这些反例定位具体错误，不能由有限测试推出所有需求或运行条件都正确。');

trace('l2.memory',[
 '打开已保存文档时，程序从持久存储读取数据，工作副本进入RAM；读取不是把文件从磁盘删除。',
 '编辑时CPU处理指令，相关数据可能被缓存到Cache。Cache是快速缓存，不是用户手动保存文档的位置。',
 '保存成功才把需要保留的工作写回持久存储；是否已保存应核对应用与文件。',
 'RAM通常断电失去内容；ROM、Cache和磁盘用途不同，不能简单按“里面都有数据”互换。'
],'这是分层存储的简化过程；真实应用可能自动恢复或缓存，不能据此断言任何未保存文件都必然消失。');
trace('l2.network',[
 '先看范围：教室设备互连属于局域网LAN，访问外地服务会经过更大范围网络。',
 '再看地址：IP参与网络寻址，但地址相同外观或设备接入同一Wi-Fi不直接证明所有服务都可达。',
 '再看协议：客户端和服务端按约定交换数据；“能连上网络”和“请求返回正确内容”是不同结果。',
 '访问失败时分别检查本地连接、地址解析、路由、目标服务与协议响应，保留实际证据。'
],'不实际扫描或连接外部设备；此例未验证真实网络配置、协议抓包或设备操作能力。');
trace('l2.languages',[
 'main.cpp保存的是源代码文本；文件名后缀不是CPU能直接执行它的证据。',
 '常见C++流程先预处理，再编译生成目标代码，链接所需部分得到可执行程序。',
 '操作系统加载程序后，CPU才执行相应机器指令；程序运行时再接收输入和产生输出。',
 '高级语言、汇编语言和机器语言按抽象层次区分；解释与编译是实现策略，不能只由扩展名判断所有语言实现。'
],'这是常见本机C++工具链流程，未替代真实编译链接操作，也不把所有语言强行分成互斥的编译型或解释型。');
trace('l2.flowchart',[
 '开始/结束用终止符，输入n与输出结果用输入输出符，判断n%2==0用判断框。',
 '从开始沿箭头进入输入，再到判断框；给两条出口分别标真与假。',
 'n=4时沿真分支输出E；n=3时沿假分支输出O，两路汇到结束。',
 '用n=0再跟踪，0%2为0，走真分支。每条路径都应有明确的去向。'
],'这里是流程图的文字推演；实际绘制仍须核符号、箭头和分支标签，不由文字回答代填画图完成。');
cpp('l2.ascii',[
 '先确认c在字符0到9之间，不能对任意字符直接减0后称为数字。',
 '输入字符7时，c-\'0\'利用连续数字字符编码得到整数7。',
 '字符0得到整数0；字母A走invalid分支，防止把字符编码当十进制数值。'
],io('int main(){\n  char c;std::cin>>c;\n  if(c>=\'0\' && c<=\'9\')std::cout<<(c-\'0\')<<"\\n";\n  else std::cout<<"invalid\\n";\n}'),[test('7\n','7\n'),test('0\n','0\n'),test('A\n','invalid\n')],'本例只处理一个基本数字字符；完整多位数解析和其他编码字符需另行设计。');
cpp('l2.conversion',[
 '表达式5/2的两个操作数均为整数，所以先得到整数2，再转换为double的2.0。',
 'double(5)/2先把左操作数转为浮点数，除法结果为2.5。',
 '输出一位小数方便看差异。要改变运算语义，转换必须发生在运算之前。'
],'#include <iostream>\n#include <iomanip>\nint main(){\n  double a=5/2;\n  double b=double(5)/2;\n  std::cout<<std::fixed<<std::setprecision(1)<<a<<" "<<b<<"\\n";\n}\n',[test('','2.0 2.5\n')],'有限范围内演示整除与浮点除法，不执行超范围浮点到整数的转换，也不宣称任意小数精确。');
cpp('l2.branches',[
 '为给例题补明确条件，本演示约定年龄至少12岁才进入卡状态判断，hasCard只取0或1。',
 '年龄11时输出age-limited；年龄12且持卡输出enter；年龄12但无卡输出need-card。',
 '内外层均写花括号，内层else只对应持卡判断；12是本例规则，不是现实准入政策。'
],io('int main(){\n  int age,hasCard;std::cin>>age>>hasCard;\n  if(age>=12){\n    if(hasCard==1){std::cout<<"enter\\n";}\n    else{std::cout<<"need-card\\n";}\n  }else{std::cout<<"age-limited\\n";}\n}'),[test('11 1\n','age-limited\n'),test('12 1\n','enter\n'),test('12 0\n','need-card\n')],'年龄与卡是虚构规则输入，不读取、修改或推断学生本人资料。');
cpp('l2.nested-loops',[
 '外层r控制当前行，从1到3；每次进入新行，内层c重新从1开始。',
 '第r行内层输出r个星号，完成该行后才输出换行。',
 '三行分别是1、2、3个星号，总共6个；不能把换行放在每个星号之后。'
],io('int main(){\n  int n;std::cin>>n;\n  for(int r=1;r<=n;++r){\n    for(int c=1;c<=r;++c){std::cout<<"*";}\n    std::cout<<"\\n";\n  }\n}'),[test('3\n','*\n**\n***\n'),test('1\n','*\n'),test('0\n','')],'演示输入0<=n<=20，0行产生空输出；大规模输出、循环上界和图形对齐另行核对。');
cpp('l2.math-functions',[
 '本例把点坐标取-9，面积取81：到零距离是abs(-9)=9，非负面积对应sqrt(81)=9。',
 'sqrt使用浮点数并核输入非负；显示为9.0只是格式。',
 '程序固定这些可核值以展示函数，不把开方对负数的实数结果当作有效输入。'
],'#include <iostream>\n#include <cmath>\n#include <iomanip>\nint main(){\n  int distance=std::abs(-9);\n  double side=std::sqrt(81.0);\n  std::cout<<distance<<" "<<std::fixed<<std::setprecision(1)<<side<<"\\n";\n}\n',[test('','9 9.0\n')],'避免对最小负整数直接求同类型绝对值；min、max及其他定义域应另按具体值验证。');
cpp('l2.random',[
 '先用种子7初始化，连续读取两次rand，保存为a和b。',
 '再次用同一种子7初始化，再读取两次。相同实现下两项分别和a、b一致。',
 '程序只输出两次比较是否相同，不硬编码具体随机数，也不要求a与b必不相同。'
],'#include <iostream>\n#include <cstdlib>\nint main(){\n  std::srand(7);int a=std::rand(),b=std::rand();\n  std::srand(7);int c=std::rand(),d=std::rand();\n  std::cout<<(a==c)<<" "<<(b==d)<<"\\n";\n}\n',[test('','1 1\n')],'同种子重复序列只在同实现内比较；rand不用于密码安全，也不把取模结果当作严格均匀。');

trace('l3.number-code',[
 '明确采用8位补码模型，先把正5写成00000101，不从真实机器signed char布局反推模型。',
 '逐位取反得到11111010，再在固定8位内加一，得到11111011。',
 '按无符号读这串位是251；按8位补码解释为251-256=-5，两种解释的位串相同。',
 '8位补码范围是-128到127，正128不在范围内；固定位宽是本题条件。'
],'这里只做指定位宽模型推演，不运行有符号溢出或把模型当作所有C++对象表示的跨平台保证。');
cpp('l3.base',[
 '26连续除2的商余为13余0、6余1、3余0、1余1、0余1。',
 '从最后一个余数倒读得到11010，按位权16+8+2复算为26。',
 '程序从高位到低位输出本例5个有效二进制位；前导0的输出规则是另外的格式要求。'
],io('int main(){\n  unsigned int n=26u;\n  for(int bit=4;bit>=0;--bit){\n    std::cout<<((n>>bit)&1u);\n  }\n  std::cout<<"\\n";\n}'),[test('','11010\n')],'固定26和5位用于核对原例；通用转换必须另处理0、位宽及题目是否要求前导0。');
cpp('l3.bitwise',[
 '5在四位模型中是0101，3是0011；同列位分别做与、或、异或。',
 '与得0001，即1；或得0111，即7；异或得0110，即6。',
 '程序用unsigned int安全演示这三个小值操作；按位运算与逻辑运算不能混用。'
],io('int main(){\n  unsigned int a=5u,b=3u;\n  std::cout<<(a&b)<<" "<<(a|b)<<" "<<(a^b)<<"\\n";\n}'),[test('','1 7 6\n')],'不直接把~5打印值当四位取反；取反的解释必须先给位宽或掩码。');
cpp('l3.shift',[
 'unsigned int至少16位，当前6u的有效位为110，向左移2位得到11000，即24。',
 '向右移1位得到11，即3；本例移位数有效且左移没有丢弃有意义高位。',
 '移位不是对任意有符号数都可直接替代乘除，先核操作数类型、位宽与移位数。'
],io('int main(){\n  unsigned int x=6u;\n  std::cout<<(x<<2)<<" "<<(x>>1)<<"\\n";\n}'),[test('','24 3\n')],'不执行负移位数、达到位宽的移位或有符号负数左移；这些不是可演示的正常边界。');
cpp('l3.algorithm-description',[
 '非空数组取首项作为best，保证best确实来自已处理元素，不凭空设0。',
 '依次处理剩余项；新值更小才更新best，因此每轮后best都是已处理前缀的最小值。',
 '处理4、-2、7后best依次为4、-2、-2；用全正数再检查初始化。'
],io('int main(){\n  int n;std::cin>>n;if(n<1||n>100)return 0;\n  long long x,best;std::cin>>best;\n  for(int i=1;i<n;++i){\n    std::cin>>x;\n    if(x<best)best=x;\n  }\n  std::cout<<best<<"\\n";\n}'),[test('3\n4 -2 7\n','-2\n'),test('1\n9\n','9\n'),test('3\n5 3 8\n','3\n')],'输入必须非空且符合约定长度；本例代码是自然语言步骤的一种实现，不代实际流程图绘制。');
cpp('l3.array',[
 'a有4个元素，下标只能是0、1、2、3；i<4避免访问a[4]。',
 's从0开始，处理2、5、1、7后分别为2、7、8、15。',
 '代码输出每一步的部分和，以便对照状态；这些输出是演示设计，不是原题输出。'
],io('int main(){\n  int a[4]={2,5,1,7};int s=0;\n  for(int i=0;i<4;++i){\n    s+=a[i];\n    std::cout<<s<<(i==3?"\\n":" ");\n  }\n}'),[test('','2 7 8 15\n')],'不通过真实越界来展示错误；访问a[4]属于需要在执行前排除的无效访问。');
cpp('l3.strings',[
 '对相同文本red blue，getline读取到换行前，保留中间空格。',
 '另一条流用>>先得到red，再得到blue；空白是分隔，第一次读取不会自动得到整行。',
 '使用两条独立字符串流比较，避免第一次读取消耗输入后影响第二种方式。'
],'#include <iostream>\n#include <sstream>\n#include <string>\nint main(){\n  std::istringstream whole("red blue\\n"),words("red blue\\n");\n  std::string line,a,b;\n  std::getline(whole,line);words>>a>>b;\n  std::cout<<line<<"\\n"<<a<<"|"<<b<<"\\n";\n}\n',[test('','red blue\nred|blue\n')],'演示基本ASCII与空格；混合cin>>与getline时还须处理已留下的换行，不能只复制此独立流设置。');
cpp('l3.enumeration',[
 '非负整数解要求x从0枚举到4，每个x唯一对应y=4-x。',
 '依次得到0,4；1,3；2,2；3,1；4,0，两个端点都包括。',
 '改变总数n仍按同一规则枚举，n=0时只有0,0一组，不遗漏零值端点。'
],io('int main(){\n  int n;std::cin>>n;\n  for(int x=0;x<=n;++x){\n    int y=n-x;\n    std::cout<<x<<" "<<y<<"\\n";\n  }\n}'),[test('4\n','0 4\n1 3\n2 2\n3 1\n4 0\n'),test('0\n','0 0\n'),test('1\n','0 1\n1 0\n')],'本例总数限制0<=n<=20，有序解区分x,y次序；若题目要求无序解或正整数，边界需改变。');
cpp('l3.simulation',[
 '初始左格3、右格8，规则要求同一时刻交换旧值，先保存oldLeft和oldRight。',
 'left取oldRight的8，right取oldLeft的3；更新一格后不读取它当另一格的旧值。',
 '再交换一次应回到初始状态，可作另一项核对。'
],io('int main(){\n  int left,right;std::cin>>left>>right;\n  int oldLeft=left,oldRight=right;\n  left=oldRight;right=oldLeft;\n  std::cout<<left<<" "<<right<<"\\n";\n}'),[test('3 8\n','8 3\n'),test('8 3\n','3 8\n'),test('-1 -1\n','-1 -1\n')],'本例是两状态同步更新；更大模拟仍须明确时间步、边界和每个值来自哪一轮。');

cpp('l4.pointer',[
 'x=6时p=&x把x的地址保存到p；p的类型是指向int的指针。',
 '*p=9通过该地址写入仍在生存期内的x，所以x变为9。',
 '输出x与*p都为9；无需打印具体地址，因为地址可因运行环境改变。'
],io('int main(){\n  int x=6;\n  int* p=&x;\n  *p=9;\n  std::cout<<x<<" "<<*p<<"\\n";\n}'),[test('','9 9\n')],'只解引用有效对象地址，不执行空指针、悬空指针或越界指针；地址数值不作固定答案。');
cpp('l4.matrix',[
 '2行3列从0编号，合法行是0、1，合法列是0、1、2，右下角是a[1][2]。',
 '本例按行放入1到6，a[1][2]为6；外层遍历行，内层遍历列。',
 '第一行求和6，第二行求和15；行列的上界不可互换。'
],io('int main(){\n  int a[2][3]={{1,2,3},{4,5,6}};\n  std::cout<<a[1][2]<<"\\n";\n  for(int r=0;r<2;++r){\n    int sum=0;\n    for(int c=0;c<3;++c)sum+=a[r][c];\n    std::cout<<sum<<"\\n";\n  }\n}'),[test('','6\n6\n15\n')],'二维示例不代任意维数组、动态尺寸或行列转换的全部要求，不访问越界单元。');
cpp('l4.struct',[
 '用结构体把name与score组成一条记录：A对应90，B对应70。',
 '若按成绩升序交换，先保存整条A，再把整条B放前，最后放回整条A。',
 '结果为B:70、A:90；只交换score会把A误配70，破坏原记录关联。'
],'#include <iostream>\n#include <string>\nstruct Student{std::string name;int score;};\nint main(){\n  Student a={"A",90},b={"B",70};\n  if(a.score>b.score){Student t=a;a=b;b=t;}\n  std::cout<<a.name<<":"<<a.score<<" "<<b.name<<":"<<b.score<<"\\n";\n}\n',[test('','B:70 A:90\n')],'姓名与分数是原创虚构记录，不是学生真实资料；结构体指针和参数行为仍需分别分析。');
cpp('l4.function',[
 '函数定义描述twice如何处理形参，不会因定义出现而自动运行。',
 '调用twice(7)时用实参7初始化形参x，计算x*2得到14并返回调用处。',
 '再调用twice(-3)返回-6；每次调用使用自己的形参值。'
],io('int twice(int x){\n  return x*2;\n}\nint main(){\n  int value;std::cin>>value;\n  std::cout<<twice(value)<<"\\n";\n}'),[test('7\n','14\n'),test('-3\n','-6\n'),test('0\n','0\n')],'输入绝对值不超过1000，使乘2在int可表示范围内；不把单函数示例当任意函数调用的全部证明。');
cpp('l4.scope',[
 '外层定义x=4，进入新花括号后另定义x=9，两个同名变量是不同对象。',
 '内层使用名称x时找到最近的内层声明，所以输出9。',
 '离开内层后该局部对象结束，外层x一直仍为4，再输出4。'
],io('int main(){\n  int x=4;\n  {\n    int x=9;\n    std::cout<<x<<"\\n";\n  }\n  std::cout<<x<<"\\n";\n}'),[test('','9\n4\n')],'这是遮蔽的教学演示，实际命名应尽量清楚；全局、局部和静态生存期还须分别核对。');
cpp('l4.parameter-value',[
 'a=5传给inc时，形参x获得数值副本5，和a是不同对象。',
 '函数中++x把副本改为6，函数退出后副本结束；调用者a仍为5。',
 '程序依次输出函数中的6和调用后的5，分清观察位置。'
],io('void inc(int x){\n  ++x;\n  std::cout<<x<<"\\n";\n}\nint main(){\n  int a=5;\n  inc(a);\n  std::cout<<a<<"\\n";\n}'),[test('','6\n5\n')],'此结论针对int值参数；指针本身按值复制时仍可能通过它修改所指对象，不能混同。');
cpp('l4.parameter-reference',[
 'incRef(int& x)的x引用调用者a，++x直接把a从5改到6。',
 '再把&a传给incPtr，指针形参p保存a的地址，通过++*p把a改到7。',
 '两次调用后分别输出6和7；值副本、引用与指针的写法和含义分别核对。'
],io('void incRef(int& x){++x;}\nvoid incPtr(int* p){++*p;}\nint main(){\n  int a=5;\n  incRef(a);std::cout<<a<<"\\n";\n  incPtr(&a);std::cout<<a<<"\\n";\n}'),[test('','6\n7\n')],'只传有效对象地址；指针非空和对象生存期在本例由调用处保证，不把此函数当通用空指针处理器。');
cpp('l4.recurrence',[
 'f(n)表示恰好走到n级的方案数。最后一步走1级来自n-1，走2级来自n-2，两类不重叠。',
 '边界f(0)=1是空方案，f(1)=1；依次得到f(2)=2、f(3)=3、f(4)=5。',
 '用两个变量保留最近两项，每轮先算next再同时向前移动，避免覆盖旧值。'
],io('int main(){\n  int n;std::cin>>n;if(n<0||n>30)return 0;\n  if(n==0){std::cout<<1<<"\\n";return 0;}\n  long long prev=1,current=1;\n  for(int i=2;i<=n;++i){\n    long long next=prev+current;\n    prev=current;current=next;\n  }\n  std::cout<<current<<"\\n";\n}'),[test('0\n','1\n'),test('1\n','1\n'),test('4\n','5\n'),test('10\n','89\n')],'本例限制0<=n<=30以明确数值范围；不把递推与递归调用混为同一种实现。');
trace('l4.sort-concepts',[
 '原记录顺序为A:2、B:1、C:2，排序关键字是数字，不是名称。',
 '升序要求B:1在两个2前面，得到B:1、A:2、C:2。',
 '稳定性另外要求相等关键字的A和C仍保持A在C前；B、C、A虽然数值有序，却不是稳定结果。',
 '内排序与外排序按主要处理数据所在存储及规模条件区分，与升降序或稳定性是不同维度。'
],'这是明确记录的排序与稳定性推演，不代表所有C++排序接口都稳定，也未完成真实外排序实验。');
cpp('l4.bubble',[
 '一轮从左向右先比3和1，交换后数组为1、3、2。',
 '再比3和2，交换后为1、2、3，本轮最大值3到末端。',
 '这里只执行一轮；对更长数组，一轮通常不够完成排序，仍需继续处理未确定前缀。'
],io('int main(){\n  int a[3]={3,1,2};\n  for(int j=0;j<2;++j){\n    if(a[j]>a[j+1]){int t=a[j];a[j]=a[j+1];a[j+1]=t;}\n    std::cout<<a[0]<<" "<<a[1]<<" "<<a[2]<<"\\n";\n  }\n}'),[test('','1 3 2\n1 2 3\n')],'相等项仅在严格大于时交换有助稳定；本程序展示原例的一轮，不冒充完整通用排序器。');
cpp('l4.insertion',[
 '前缀2、5、7已升序，先保存待插入的4，不能右移时把它覆盖。',
 '7大于4，右移；5大于4，右移；2不大于4，停止。',
 'j停在0，在j+1即位置1放4，得到2、4、5、7；先判断j>=0再读取a[j]。'
],io('int main(){\n  int a[4]={2,5,7,4};\n  int key=a[3],j=2;\n  while(j>=0 && a[j]>key){a[j+1]=a[j];--j;}\n  a[j+1]=key;\n  for(int i=0;i<4;++i)std::cout<<a[i]<<(i==3?"\\n":" ");\n}'),[test('','2 4 5 7\n')],'本例只展示一次插入；完整算法须对后续每项维持有序前缀，不能漏掉向最前位置插入的边界。');
cpp('l4.selection',[
 '首轮从3、1、2中扫描最小位置：先记位置0，再发现位置1的1更小，位置2不更新。',
 '交换位置0与1，数组变1、3、2，首位置确定。',
 '剩下3、2仍未有序，需下一轮；选择排序长距离交换通常不保证稳定。'
],io('int main(){\n  int a[3]={3,1,2};int pos=0;\n  for(int j=1;j<3;++j)if(a[j]<a[pos])pos=j;\n  int t=a[0];a[0]=a[pos];a[pos]=t;\n  std::cout<<a[0]<<" "<<a[1]<<" "<<a[2]<<"\\n";\n}'),[test('','1 3 2\n')],'只演示第一轮选择，不把这一轮后首项正确当完整排序完成，也不声称选择排序稳定。');
cpp('l4.complexity',[
 '同样外层n次，第一段每轮内层固定3次，总计3n次；第二段内层也n次，总计n²次。',
 'n=4时分别为12和16；n=8时分别为24和64，比较增长而不只比一次计时。',
 '按所计循环体次数，渐近时间分别为O(n)与O(n²)，这里的计数不等同完整机器指令数。'
],io('int main(){\n  int n;std::cin>>n;long long linear=0,square=0;\n  for(int i=0;i<n;++i)for(int j=0;j<3;++j)++linear;\n  for(int i=0;i<n;++i)for(int j=0;j<n;++j)++square;\n  std::cout<<linear<<" "<<square<<"\\n";\n}'),[test('4\n','12 16\n'),test('8\n','24 64\n'),test('0\n','0 0\n')],'输入限制0<=n<=100；n=0的观测不用于否定渐近阶，空间复杂度还须另说明是否计入输入存储。');
trace('l4.file',[
 '先确认程序工作目录与scores.txt位置，再构造ifstream in("scores.txt")；相对路径按实际工作目录解释。',
 '检查流状态，打开失败就走明确错误路径，不能把未读到的值当正常零值。',
 '用while(in >> x)在每次成功读取后处理x；最后一次失败不会再次使用旧x，避免while(!in.eof())的常见重复。',
 '标准输入重定向由运行环境把数据接入cin，和程序内按路径打开文件是两种接口，须按题目环境选用。'
],'隔离执行器禁止依赖宿主文件，本例保留文字过程，未实际读取、创建或修改用户文件；真实文件流操作仍待验。');
cpp('l4.exception',[
 '进入try先输出A，throw 7抛出int后，try里输出B的语句被跳过。',
 'catch(int)类型匹配，输出C；处理结束后继续到块后的输出D。',
 '所以完整结果为ACD；未执行B不是输出丢失，而是异常改变控制流。'
],io('int main(){\n  try{\n    std::cout<<"A";\n    throw 7;\n    std::cout<<"B";\n  }catch(int){std::cout<<"C";}\n  std::cout<<"D\\n";\n}'),[test('','ACD\n')],'异常只处理匹配的已抛出异常，不自动发现错误答案，也不能使除零、越界或其他未定义行为合法。');

module.exports={format:'gesp-worked-examples-v1',teacherReviewed:false,automaticPublication:false,rows};
