#!/usr/bin/env python3
"""Gewichte (Conv/ConvTranspose) als int8 pro Kanal speichern + DequantizeLinear. Aufruf: int8w.py in.onnx out.onnx [--dyn]"""
import sys, onnx, numpy as np
from onnx import numpy_helper, helper, TensorProto
src, dst = sys.argv[1], sys.argv[2]
m = onnx.load(src); g = m.graph
if '--dyn' in sys.argv:
    for v in list(g.input) + list(g.output):
        d = v.type.tensor_type.shape.dim
        if len(d) == 4: d[2].dim_param = 'h'; d[3].dim_param = 'w'
convw = {}
for n in g.node:
    if n.op_type in ('Conv', 'ConvTranspose') and len(n.input) > 1:
        convw[n.input[1]] = 1 if n.op_type == 'ConvTranspose' else 0
used = set(i for n in g.node for i in n.input)
inits, pre = [], []
for t in g.initializer:
    if t.name not in used: continue
    a = numpy_helper.to_array(t)
    if t.name in convw and a.dtype == np.float32 and a.size >= 256:
        ax = convw[t.name]
        red = tuple(i for i in range(a.ndim) if i != ax)
        mx = np.abs(a).max(axis=red); sc = np.where(mx > 0, mx / 127.0, 1.0).astype(np.float32)
        shp = [1] * a.ndim; shp[ax] = -1
        q = np.clip(np.round(a / sc.reshape(shp)), -127, 127).astype(np.int8)
        inits += [numpy_helper.from_array(q, t.name + '_q'), numpy_helper.from_array(sc, t.name + '_s'),
                  numpy_helper.from_array(np.zeros(sc.shape, np.int8), t.name + '_z')]
        pre.append(helper.make_node('DequantizeLinear', [t.name + '_q', t.name + '_s', t.name + '_z'], [t.name], axis=ax))
    elif a.dtype == np.float32 and a.size >= 64:
        inits.append(numpy_helper.from_array(a.astype(np.float16), t.name + '_h'))
        pre.append(helper.make_node('Cast', [t.name + '_h'], [t.name], to=TensorProto.FLOAT))
    else:
        inits.append(t)
del g.initializer[:]; g.initializer.extend(inits)
nodes = list(g.node); del g.node[:]; g.node.extend(pre + nodes)
if m.opset_import[0].version < 13: m.opset_import[0].version = 13
onnx.checker.check_model(m); onnx.save(m, dst); print(dst)
