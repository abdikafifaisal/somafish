/** Somafish admin backend. Mount this router at /api/admin.
 * Dependencies: express, mongoose, bcryptjs, jsonwebtoken, express-rate-limit, multer.
 * Models are supplied by your existing app (see README); no schemas are overwritten.
 */
'use strict';
const express=require('express');
const bcrypt=require('bcryptjs');
const jwt=require('jsonwebtoken');
const crypto=require('crypto');
const rateLimit=require('express-rate-limit');
const multer=require('multer');
const path=require('path');
const fs=require('fs/promises');

const COOKIE='somafish_admin';
const STATUS=['pending','confirmed','preparing','out_for_delivery','delivered','cancelled'];
const PAYMENTS=['paid','unpaid'];
const MODEL_MESSAGE_STATUS=['new','replied'];
const positiveId=id=>/^[\da-f]{24}$/i.test(id);
const safeText=(v,max=160)=>typeof v==='string'?v.trim().slice(0,max):'';
const money=v=>{const n=Number(v);return Number.isFinite(n)?Math.round(n*100)/100:0;};
const toBool=v=>v===true||v==='true';
const safeRegex=v=>v.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const isoDate=(v,end=false)=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(v||''))return null;const d=new Date(v+'T00:00:00.000Z');if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==v)return null;if(end)d.setUTCDate(d.getUTCDate()+1);return d;};
function plain(obj){return obj?.toObject?.()||obj||{};}
function normalizeOrder(doc){const o=plain(doc),cust=o.customer||{},delivery=o.delivery||{};
 const items=(Array.isArray(o.items)?o.items:[]).map(i=>({name:safeText(i.name||i.productName||i.product?.name,160),quantity:Number(i.quantity??i.qty??0),unit:i.unit||'kg',price:money(i.price??i.unitPrice),lineTotal:money(i.lineTotal??i.total??(Number(i.quantity||i.qty||0)*Number(i.price||i.unitPrice||0)))}));
 const subtotal=money(o.subtotal??items.reduce((s,i)=>s+i.lineTotal,0)), deliveryFee=money(o.deliveryFee??o.deliveryCost??2);
 return {_id:String(o._id),orderNumber:o.orderNumber||o.orderNo||String(o._id).slice(-8),createdAt:o.createdAt,customerName:o.customerName||cust.name||o.name||'',phone:o.phone||cust.phone||'',total:money(o.total??o.totalAmount??subtotal+deliveryFee),subtotal,deliveryFee,status:o.status||'pending',paymentStatus:o.paymentStatus||'unpaid',items,deliveryArea:o.deliveryArea||delivery.area||'',address:o.address||o.addressNotes||delivery.address||'',notes:o.notes||o.deliveryNotes||'',deliveryTime:o.deliveryTime||o.preferredDeliveryTime||''};}
function normalizeProduct(doc){const p=plain(doc);return {_id:String(p._id),name:p.name||'',category:p.category||'',price:money(p.price),unit:p.unit||'kg',image:p.image||'',description:p.description||'',inStock:p.inStock!==false};}
function normalizeMessage(doc){const m=plain(doc);return {_id:String(m._id),topic:m.topic||m.subject||'',name:m.name||'',phone:m.phone||'',email:m.email||'',orderNumber:m.orderNumber||'',message:m.message||'',status:m.status||(m.replied?'replied':'new'),createdAt:m.createdAt};}
function adminFactory({Admin,Order,Product,Message,jwtSecret,uploadDir}){
 if(!Admin||!Order||!Product||!Message)throw Error('Admin, Order, Product, Message models must be supplied');
 if(!jwtSecret||jwtSecret.length<32)throw Error('ADMIN_JWT_SECRET must be at least 32 characters');
 const router=express.Router(),uploads=path.resolve(uploadDir||path.join(process.cwd(),'public/uploads/products'));
 router.use((req,res,next)=>{res.set('Cache-Control','no-store');next();});
 router.use(express.json({limit:'32kb'}));
 const loginLimiter=rateLimit({windowMs:15*60*1000,limit:5,standardHeaders:'draft-7',legacyHeaders:false,message:{error:'Too many attempts. Try again in 15 minutes.'}});
 const secureCookie=process.env.NODE_ENV==='production';
 const cookieOpts={httpOnly:true,secure:secureCookie,sameSite:'strict',path:'/',maxAge:8*60*60*1000};
 const parseCookie=req=>{const header=req.headers.cookie||'';for(const entry of header.split(';')){const pos=entry.indexOf('=');if(pos<0)continue;if(entry.slice(0,pos).trim()===COOKIE)return decodeURIComponent(entry.slice(pos+1).trim());}return null;};
 const publicOrigin = process.env.RENDER_EXTERNAL_URL
   ? new URL(process.env.RENDER_EXTERNAL_URL).origin
   : null;
 const allowOrigin = (req, res, next) => {
  const origin = req.get('Origin');
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || !origin) return next();
  // Render terminates HTTPS before forwarding requests to Express.
  const expectedOrigin = publicOrigin || `${req.protocol}://${req.get('host')}`;
  if (origin !== expectedOrigin) return res.status(403).json({error:'Invalid request origin'});
  next();
 };
 router.use(allowOrigin);
 router.post('/login',loginLimiter,async(req,res,next)=>{try{const username=safeText(req.body?.username,80),password=req.body?.password;if(!username||typeof password!=='string'||password.length>200)return res.status(400).json({error:'Invalid credentials'});
  const a=await Admin.findOne({username}).select('+passwordHash +password');const hash=a?.passwordHash||a?.password;const ok=hash?await bcrypt.compare(password,hash):false;if(!a||!ok||a.isActive===false)return res.status(401).json({error:'Invalid username or password'});
  const csrf=crypto.randomBytes(24).toString('hex');const token=jwt.sign({sub:String(a._id),csrf},jwtSecret,{expiresIn:'8h',issuer:'somafish-admin',audience:'somafish-dashboard'});res.cookie(COOKIE,token,cookieOpts);res.json({ok:true});}catch(e){next(e);}});
 const auth=async(req,res,next)=>{try{const token=parseCookie(req);if(!token)return res.status(401).json({error:'Authentication required'});const decoded=jwt.verify(token,jwtSecret,{issuer:'somafish-admin',audience:'somafish-dashboard'});if(!positiveId(decoded.sub))return res.status(401).json({error:'Invalid session'});const admin=await Admin.findById(decoded.sub).select('username isActive');if(!admin||admin.isActive===false)return res.status(401).json({error:'Invalid session'});req.admin=admin;req.adminCsrf=decoded.csrf;next();}catch{return res.status(401).json({error:'Session expired'});}};
 const csrfCheck=(req,res,next)=>{if(['GET','HEAD','OPTIONS'].includes(req.method))return next();const token=req.get('X-CSRF-Token')||'';if(!token||token.length!==req.adminCsrf.length||!crypto.timingSafeEqual(Buffer.from(token),Buffer.from(req.adminCsrf)))return res.status(403).json({error:'Invalid security token. Reload the page.'});next();};
 router.use(auth);router.use(csrfCheck);
 router.get('/session',(req,res)=>res.json({username:req.admin.username,csrf:req.adminCsrf}));
 router.post('/logout',(req,res)=>{res.clearCookie(COOKIE,{httpOnly:true,secure:secureCookie,sameSite:'strict',path:'/'});res.json({ok:true});});
 router.get('/summary',async(req,res,next)=>{try{const now=Date.now();const start=new Date(Math.floor((now+3*3600000)/86400000)*86400000-3*3600000);const end=new Date(start.getTime()+86400000);
  const today=await Order.find({createdAt:{$gte:start,$lt:end}}).lean();const ordersToday=today.length;
  const salesToday=money(today.filter(o=>o.paymentStatus==='paid' && o.status!=='cancelled').reduce((sum,o)=>sum+normalizeOrder(o).total,0));
  const waitingOrders=await Order.countDocuments({status:{$in:['pending','new']}});
  const newMessages=await Message.countDocuments({$or:[{status:'new'},{status:{$exists:false},replied:{$ne:true}}]});
  const latest=await Order.findOne().sort({createdAt:-1,_id:-1}).select('_id').lean();res.json({ordersToday,salesToday,waitingOrders,newMessages,latestOrderId:latest?String(latest._id):null});}catch(e){next(e);}});
 const pageInfo=req=>{const n=Number(req.query.page);return Number.isSafeInteger(n)&&n>=1?Math.min(n,100000):1;};
 router.get('/orders',async(req,res,next)=>{try{const filter={};if(req.query.status){if(!STATUS.includes(req.query.status))return res.status(400).json({error:'Invalid status'});filter.status=req.query.status;}
  if(req.query.from||req.query.to){const from=req.query.from?isoDate(req.query.from):null,to=req.query.to?isoDate(req.query.to,true):null;if((req.query.from&&!from)||(req.query.to&&!to)||from&&to&&from>=to)return res.status(400).json({error:'Invalid date range'});filter.createdAt={};if(from)filter.createdAt.$gte=from;if(to)filter.createdAt.$lt=to;}
  const q=safeText(req.query.q,80);if(q){const rx=new RegExp(safeRegex(q),'i');filter.$or=[{orderNumber:rx},{phone:rx},{'customer.phone':rx}];}
  const page=pageInfo(req),total=await Order.countDocuments(filter),docs=await Order.find(filter).sort({createdAt:-1,_id:-1}).skip((page-1)*20).limit(20).lean();res.json({items:docs.map(normalizeOrder),page,pages:Math.max(1,Math.ceil(total/20)),total});}catch(e){next(e);}});
 router.patch('/orders/:id',async(req,res,next)=>{try{if(!positiveId(req.params.id))return res.status(400).json({error:'Invalid order ID'});const allowed=['status','paymentStatus'];const keys=Object.keys(req.body||{});if(!keys.length||keys.some(k=>!allowed.includes(k)))return res.status(400).json({error:'Only status and paymentStatus can change'});
  const patch={};if('status' in req.body){if(!STATUS.includes(req.body.status))return res.status(400).json({error:'Invalid status'});patch.status=req.body.status;}if('paymentStatus' in req.body){if(!PAYMENTS.includes(req.body.paymentStatus))return res.status(400).json({error:'Invalid payment status'});patch.paymentStatus=req.body.paymentStatus;}
  const doc=await Order.findByIdAndUpdate(req.params.id,{$set:patch},{new:true,runValidators:true});if(!doc)return res.status(404).json({error:'Order not found'});res.json(normalizeOrder(doc));}catch(e){next(e);}});
 router.get('/products',async(req,res,next)=>{try{const docs=await Product.find().sort({name:1}).lean();res.json({items:docs.map(normalizeProduct)});}catch(e){next(e);}});
 const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:2*1024*1024,files:1},fileFilter:(req,file,cb)=>{if(!['image/jpeg','image/png','image/webp'].includes(file.mimetype))return cb(new Error('Only JPG, PNG or WebP images are allowed'));cb(null,true);}});
 const imageCheck=b=>{if(b.length>=3&&b[0]===0xff&&b[1]===0xd8&&b[2]===0xff)return '.jpg';if(b.length>=8&&b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return '.png';if(b.length>=12&&b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WEBP')return '.webp';return null;};
 async function imagePath(file){if(!file)return null;const ext=imageCheck(file.buffer);if(!ext)throw Object.assign(new Error('Invalid image file contents'),{status:400});await fs.mkdir(uploads,{recursive:true});const filename=crypto.randomUUID()+ext;await fs.writeFile(path.join(uploads,filename),file.buffer,{flag:'wx'});return '/uploads/products/'+filename;}
 const validProduct=(body,partial,hasImage=false)=>{const out={}, fields=['name','category','price','unit','description','inStock'];if(Object.keys(body).some(key=>!fields.includes(key)))throw Object.assign(new Error('Unexpected product field'),{status:400});
  for(const field of ['name','category','unit'])if(!partial||field in body){const value=safeText(body[field],field==='name'?160:80);if(!value)throw Object.assign(new Error(`${field} is required`),{status:400});out[field]=value;}
  if(!partial||'price' in body){const p=Number(body.price);if(!Number.isFinite(p)||p<0||p>100000)throw Object.assign(new Error('Price must be between 0 and 100000'),{status:400});out.price=money(p);}
  if('description' in body)out.description=safeText(body.description,1000);
  if(!partial||'inStock' in body)out.inStock=toBool(body.inStock);
  if(partial&&!Object.keys(out).length&&!hasImage)throw Object.assign(new Error('No changes submitted'),{status:400});return out;};
 const uploadOne=(req,res,next)=>upload.single('image')(req,res,err=>err?res.status(400).json({error:err.message}):next());
 router.post('/products',uploadOne,async(req,res,next)=>{let image;try{const patch=validProduct(req.body,false);image=await imagePath(req.file);if(image)patch.image=image;const doc=await Product.create(patch);res.status(201).json(normalizeProduct(doc));}catch(e){if(image)await fs.rm(path.join(uploads,path.basename(image)),{force:true}).catch(()=>{});next(e);}});
 router.patch('/products/:id',uploadOne,async(req,res,next)=>{let image;try{if(!positiveId(req.params.id))return res.status(400).json({error:'Invalid product ID'});const patch=validProduct(req.body,true,!!req.file);image=await imagePath(req.file);if(image)patch.image=image;const doc=await Product.findByIdAndUpdate(req.params.id,{$set:patch},{new:true,runValidators:true});if(!doc){if(image)await fs.rm(path.join(uploads,path.basename(image)),{force:true}).catch(()=>{});return res.status(404).json({error:'Product not found'});}res.json(normalizeProduct(doc));}catch(e){if(image)await fs.rm(path.join(uploads,path.basename(image)),{force:true}).catch(()=>{});next(e);}});
 router.delete('/products/:id',async(req,res,next)=>{try{if(!positiveId(req.params.id))return res.status(400).json({error:'Invalid product ID'});const doc=await Product.findByIdAndDelete(req.params.id);if(!doc)return res.status(404).json({error:'Product not found'});res.json({ok:true});}catch(e){next(e);}});
 router.get('/messages',async(req,res,next)=>{try{const filter={};if(req.query.status){if(!MODEL_MESSAGE_STATUS.includes(req.query.status))return res.status(400).json({error:'Invalid message status'});filter.status=req.query.status;}const page=pageInfo(req),total=await Message.countDocuments(filter),docs=await Message.find(filter).sort({createdAt:-1,_id:-1}).skip((page-1)*20).limit(20).lean();res.json({items:docs.map(normalizeMessage),page,pages:Math.max(1,Math.ceil(total/20)),total});}catch(e){next(e);}});
 router.patch('/messages/:id',async(req,res,next)=>{try{if(!positiveId(req.params.id)||req.body?.status!=='replied'||Object.keys(req.body).length!==1)return res.status(400).json({error:'Invalid message update'});const doc=await Message.findByIdAndUpdate(req.params.id,{$set:{status:'replied'}},{new:true,runValidators:true});if(!doc)return res.status(404).json({error:'Message not found'});res.json(normalizeMessage(doc));}catch(e){next(e);}});
 router.use((err,req,res,next)=>{console.error('Admin API error:',err);res.status(err.status|| (err.name==='ValidationError'?400:500)).json({error:err.status||err.name==='ValidationError'?err.message:'Server error. Please try again.'});});
 return {router,auth};
}
module.exports=adminFactory;
