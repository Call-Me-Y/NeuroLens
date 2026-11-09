import unittest
import torch
from measurements import linear_cka

class Measurements(unittest.TestCase):
    def test_cka_invariance_and_degenerate_inputs(self):
        torch.manual_seed(7)
        x=torch.randn(12,8)
        q,_=torch.linalg.qr(torch.randn(8,8))
        cka=linear_cka(torch.stack([x,3*x@q+10,torch.zeros_like(x)],dim=1))
        self.assertAlmostEqual(cka[0][1],1,places=5)
        self.assertIsNone(cka[0][2])
        self.assertIsNone(linear_cka(torch.randn(2,3,4))[0][0])
    def test_column_sensitivity_matches_neuron_gate_derivative(self):
        torch.manual_seed(3)
        weight = torch.randn(5, 9, requires_grad=True)
        activation = torch.randn(4, 9)
        gate = torch.ones(9, requires_grad=True)
        output = (activation * gate) @ weight.T
        output.square().mean().backward()
        self.assertTrue(torch.allclose((weight * weight.grad).sum(0), gate.grad, atol=1e-5))
        self.assertEqual(gate.grad.shape, (9,))

if __name__ == '__main__':
    unittest.main()
